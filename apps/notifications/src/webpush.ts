export interface PushSubscription {
	endpoint: string;
	keys: { p256dh: string; auth: string };
}

function b64UrlDecode(str: string): Uint8Array {
	const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
	const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
	return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

function b64UrlEncode(bytes: Uint8Array): string {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function concat(...arrays: Uint8Array[]): Uint8Array {
	const out = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0));
	let offset = 0;
	for (const a of arrays) {
		out.set(a, offset);
		offset += a.length;
	}
	return out;
}

async function hkdf(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
	const key = await crypto.subtle.importKey('raw', ikm, { name: 'HKDF' }, false, ['deriveBits']);
	const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8);
	return new Uint8Array(bits);
}

async function vapidJwt(audience: string, subject: string, publicKeyBytes: Uint8Array, privateKeyB64: string): Promise<string> {
	const header = b64UrlEncode(new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
	const now = Math.floor(Date.now() / 1000);
	const payload = b64UrlEncode(new TextEncoder().encode(JSON.stringify({ aud: audience, exp: now + 43200, sub: subject })));
	const signingInput = `${header}.${payload}`;

	const x = b64UrlEncode(publicKeyBytes.slice(1, 33));
	const y = b64UrlEncode(publicKeyBytes.slice(33, 65));
	const signingKey = await crypto.subtle.importKey(
		'jwk',
		{ kty: 'EC', crv: 'P-256', d: privateKeyB64, x, y, key_ops: ['sign'] },
		{ name: 'ECDSA', namedCurve: 'P-256' },
		false,
		['sign'],
	);

	const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, signingKey, new TextEncoder().encode(signingInput));
	return `${signingInput}.${b64UrlEncode(new Uint8Array(sig))}`;
}

async function encryptPayload(
	p256dhB64: string,
	authB64: string,
	payload: string,
): Promise<{ body: Uint8Array; serverPublicKey: Uint8Array; salt: Uint8Array }> {
	const uaPublicKeyBytes = b64UrlDecode(p256dhB64);
	const authBytes = b64UrlDecode(authB64);

	// Ephemeral server key pair
	const serverKeyPair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
	const serverPublicKeyRaw = (await crypto.subtle.exportKey('raw', serverKeyPair.publicKey)) as ArrayBuffer;
	const serverPublicKey = new Uint8Array(serverPublicKeyRaw);

	// ECDH shared secret
	const uaPublicKey = await crypto.subtle.importKey('raw', uaPublicKeyBytes, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
	const sharedSecretBits = await crypto.subtle.deriveBits(
		// CF Workers types incorrectly use $public; runtime expects public
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		{ name: 'ECDH', public: uaPublicKey } as any,
		serverKeyPair.privateKey,
		256,
	);
	const sharedSecret = new Uint8Array(sharedSecretBits);

	const salt = crypto.getRandomValues(new Uint8Array(16));

	// RFC 8291 key derivation
	const ikm = await hkdf(
		sharedSecret,
		authBytes,
		concat(new TextEncoder().encode('WebPush: info\x00'), uaPublicKeyBytes, serverPublicKey),
		32,
	);
	const cek = await hkdf(ikm, salt, new TextEncoder().encode('Content-Encoding: aes128gcm\x00'), 16);
	const nonce = await hkdf(ikm, salt, new TextEncoder().encode('Content-Encoding: nonce\x00'), 12);

	const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
	const plaintext = concat(new TextEncoder().encode(payload), new Uint8Array([2])); // 0x02 = last-record delimiter
	const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, plaintext));

	// RFC 8188 header: salt(16) | rs(4, BE) | idlen(1) | keyid
	const header = new Uint8Array(21 + serverPublicKey.length);
	header.set(salt, 0);
	new DataView(header.buffer).setUint32(16, 4096, false);
	header[20] = serverPublicKey.length;
	header.set(serverPublicKey, 21);

	return { body: concat(header, ciphertext), serverPublicKey, salt };
}

export async function sendPushNotification(
	subscription: PushSubscription,
	payload: string,
	vapidSubject: string,
	vapidPublicKey: string,
	vapidPrivateKey: string,
): Promise<void> {
	const publicKeyBytes = b64UrlDecode(vapidPublicKey);
	const { protocol, host } = new URL(subscription.endpoint);
	const audience = `${protocol}//${host}`;

	const [jwt, { body }] = await Promise.all([
		vapidJwt(audience, vapidSubject, publicKeyBytes, vapidPrivateKey),
		encryptPayload(subscription.keys.p256dh, subscription.keys.auth, payload),
	]);

	const response = await fetch(subscription.endpoint, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/octet-stream',
			'Content-Encoding': 'aes128gcm',
			TTL: '60',
			Authorization: `vapid t=${jwt},k=${vapidPublicKey}`,
		},
		body,
	});

	if (!response.ok && response.status !== 201) {
		const err = new Error(`Push service responded ${response.status}`);
		(err as { statusCode?: number }).statusCode = response.status;
		throw err;
	}
}
