# Changelog

## [1.0.0-beta.43](https://github.com/uoplan/uoplan/compare/uoplan-monorepo-v1.0.0-beta.42...uoplan-monorepo-v1.0.0-beta.43) (2026-09-08)


### Features

* import official uoZone schedules ([2361a0e](https://github.com/uoplan/uoplan/commit/2361a0ebaf4fa1d717c278f39950d0ca3fb9472c))


### Bug Fixes

* **nav:** make back button navigate to logical parent, not browser history ([d4a4c50](https://github.com/uoplan/uoplan/commit/d4a4c50ebd8bda676718a9fe3a3a7405d9a726d0))
* parse current uoZone schedule pages ([83e7251](https://github.com/uoplan/uoplan/commit/83e725159ba73780dbae4366a92b90147446a6aa))

## [1.0.0-beta.42](https://github.com/uoplan/uoplan/compare/uoplan-monorepo-v1.0.0-beta.41...uoplan-monorepo-v1.0.0-beta.42) (2026-08-11)


### Features

* add Carleton University support alongside uOttawa ([a50dac7](https://github.com/uoplan/uoplan/commit/a50dac72a237ba3bf17bcf6498807ccbde8b6d11))
* **explore:** add a faculty index to the explore landing page ([a41cfe7](https://github.com/uoplan/uoplan/commit/a41cfe7e1798be4ee25b7bee5affdb22dcacb99b))


### Bug Fixes

* **ci:** apply description payload budgets per school ([5a1a3f6](https://github.com/uoplan/uoplan/commit/5a1a3f6d3e4f1addb64e81333722978e05a40a0b))
* **ci:** drop dead legacy flat-layout migration from daily scrape ([5e1d8cc](https://github.com/uoplan/uoplan/commit/5e1d8cc8f0dbab295ff25fa3a117db05d23ace0b))
* **ci:** hydrate scraper data from the data branch before scraping ([c9a01b9](https://github.com/uoplan/uoplan/commit/c9a01b9abc0f71dd7749a9de356e33ccfa092151))
* **data:** keep the flat default school when a data branch is mid-migration ([2ef8339](https://github.com/uoplan/uoplan/commit/2ef833912f249620ee8094bf31515af644fff616))
* **scraper:** resolve domain barrel imports under plain node ([44e16b1](https://github.com/uoplan/uoplan/commit/44e16b160bb762d916f8433233d2d452ba44b952))

## [1.0.0-beta.41](https://github.com/uoplan/uoplan/compare/uoplan-monorepo-v1.0.0-beta.40...uoplan-monorepo-v1.0.0-beta.41) (2026-07-15)


### Features

* add catalogue prereq-history proto + data-asset size report ([9b68af3](https://github.com/uoplan/uoplan/commit/9b68af33c5e27ad425a973c7b66ed5af98f4f3ab))
* add compact description keyword search index (dictionary + BM25) ([d4ae366](https://github.com/uoplan/uoplan/commit/d4ae3668dd3726873f2d378c418e26b66c2f5884))
* add important dates and deadlines ([7f7059c](https://github.com/uoplan/uoplan/commit/7f7059c87bb18d0e9abaeace0c138a73513d9b47))
* **basket:** relabel empty CTA to Open Explore ([d91b41f](https://github.com/uoplan/uoplan/commit/d91b41f07aa2368e80b9449d8dcdae699b5c2e23))
* bundle union catalogue in native app, drop per-year catalogues ([8f557cc](https://github.com/uoplan/uoplan/commit/8f557cc0b2821e3edad90bf8321360f30cbf3037))
* **core:** add combined multi-term iCalendar builder ([29dc268](https://github.com/uoplan/uoplan/commit/29dc2683d8fa22b7c8cf339ba15c621022129849))
* **explore:** add course descriptions and prerequisite graphs ([851e20e](https://github.com/uoplan/uoplan/commit/851e20e9d81b12027182b7283933644f605998b2))
* **native:** integrate the shared planner store ([5896183](https://github.com/uoplan/uoplan/commit/5896183232662bc2ef80773494047b5ca670c3d3))
* **planner:** tabbed per-term sidebar with variant nav and downloads ([2786327](https://github.com/uoplan/uoplan/commit/27863278006ac8c90911d311d9b72c89de614826))
* ship union catalogue + prereq-history overlay for web data layer ([2ad6b69](https://github.com/uoplan/uoplan/commit/2ad6b6919787e2b365e2bae373dd8489bb5e8dbf))
* surface description keyword matches in native explore search ([16a77a4](https://github.com/uoplan/uoplan/commit/16a77a43acc7c0de359c18928432da6a662816fc))
* surface description keyword matches in web explore search ([5d3fcaa](https://github.com/uoplan/uoplan/commit/5d3fcaae827f8aad819f1ba1ba31556ca51e1d69))
* **web:** add explore delivery filtering ([8329745](https://github.com/uoplan/uoplan/commit/83297452df3eba4602febe9b607dec5532b3597f))
* **web:** animate graph term calendar when its schedule changes ([1cf7e0c](https://github.com/uoplan/uoplan/commit/1cf7e0cce0f349907f666f20144963700bc8b444))
* **web:** expand a graph term into an in-page calendar overlay instead of navigating ([3229468](https://github.com/uoplan/uoplan/commit/32294685c6e679c3b5af08b0418583d7670a9b35))
* **web:** expand or switch the graph calendar overlay from term tabs ([012eaf3](https://github.com/uoplan/uoplan/commit/012eaf31535982ea7fec4b776fea2ddfa80ad014))
* **web:** float open-in-calendar as two cards over the graph ([a6a527b](https://github.com/uoplan/uoplan/commit/a6a527b0e0ddd8c6884d02abf18ceb2c33ca062f))
* **web:** forward graph term schedule into calendar without touching the basket ([9aa6c2c](https://github.com/uoplan/uoplan/commit/9aa6c2cc455768e2074d4e09888a83d758fbe559))
* **web:** highlight quick schedule flow ([4461bca](https://github.com/uoplan/uoplan/commit/4461bcae8eaa16928d8f34bada7629aa35269269))
* **web:** make the graph planner floating panel resizable ([06d9095](https://github.com/uoplan/uoplan/commit/06d9095272ed017605ab1f0a7d30b93380c8326e))
* **web:** make the graph planner sidebar a floating movable collapsible panel ([9a887a9](https://github.com/uoplan/uoplan/commit/9a887a907253f3ce908c39952b9087dcb9e97446))
* **web:** minimize calendar to overview and move missing-course banner into planner tab ([b971ff0](https://github.com/uoplan/uoplan/commit/b971ff05f441400253f291d4920ad789bcb9c222))
* **web:** open graph planner options as a drag-to-dismiss bottom sheet on mobile ([7b49adb](https://github.com/uoplan/uoplan/commit/7b49adb24b7fa0d07728be93eac63d7546a9f0c5))
* **web:** remove floating cart button on the schedule calendar and graph ([c10caf6](https://github.com/uoplan/uoplan/commit/c10caf6cf361b4a90a49ed6a94b9fb685c4ab1aa))
* **web:** render graph term nodes as resizable calendars with course popovers ([a1803ac](https://github.com/uoplan/uoplan/commit/a1803ac5eb76e727df99e632ff98037c20e50580))


### Bug Fixes

* blend description keyword hits into explore search ranking ([f149424](https://github.com/uoplan/uoplan/commit/f149424fb296074cbbfa1c5a3d3e555c4f1685df))
* **explore:** include catalogue-only courses ([84fc764](https://github.com/uoplan/uoplan/commit/84fc7646357a8ec2693f66d26232af213d603544))
* **i18n:** enforce SEO translation coverage ([b561f63](https://github.com/uoplan/uoplan/commit/b561f6358834c8d82c58719d7813bddc9997dfcf))
* **schedule:** derive basic course count from cart ([310bcc8](https://github.com/uoplan/uoplan/commit/310bcc81f924c8c9d0f5e508541cfa65caa8b5aa))
* treat earlier planned terms as completed when opening a graph term in the calendar ([8472d1e](https://github.com/uoplan/uoplan/commit/8472d1ee9ef3ea943d401fdedc1848d7bec810a0))
* **web:** name degree planner in back buttons and default-zoom graph to recent+future terms ([ec70458](https://github.com/uoplan/uoplan/commit/ec70458e98b6c8e075b6f4f30ac59785c2f39fff))
* **web:** vary graph term seed so regenerating produces a new schedule ([7c28140](https://github.com/uoplan/uoplan/commit/7c28140926fea08f0aa2a7001e381ebf49d28acf))


### Performance Improvements

* **build:** cache rendered changelog HTML to cut build wall-time ([12f6f4b](https://github.com/uoplan/uoplan/commit/12f6f4b2a40135203c148f998692dc49cb563b14))
* **data:** add deduplicated program-history overlay to replace per-year program assets ([0900502](https://github.com/uoplan/uoplan/commit/090050273e447aed60dbe351c15c06084692c447))
* **web:** defer WASM engine and schedule worker off initial route bundle ([eb532fa](https://github.com/uoplan/uoplan/commit/eb532fa8b0f5f67e1335584132a574a4a4bfe476))
* **web:** drop unused dm-mono 300 weight from initial load ([af559c7](https://github.com/uoplan/uoplan/commit/af559c7a5fe3e7d6ee8219052a6e4e71f5e21649))
* **web:** reconstruct cohort programs from history overlay, drop per-year program assets ([9006b75](https://github.com/uoplan/uoplan/commit/9006b756a5e8550e5d34dbf71c4d60eee61e3159))

## [1.0.0-beta.40](https://github.com/uoplan/uoplan/compare/uoplan-monorepo-v1.0.0-beta.39...uoplan-monorepo-v1.0.0-beta.40) (2026-07-04)


### Features

* **marketing:** 3D multi-device launch video with live app-capture harness ([369baa5](https://github.com/uoplan/uoplan/commit/369baa5b7f4905907375aa314cd9972c98064d84))
* **marketing:** continuous spin/scroll, page settle, dual explore search ([e2e3584](https://github.com/uoplan/uoplan/commit/e2e3584d9cc039f8f65f7329a93c8940f616a7e4))
* **marketing:** rework launch ad into 45s multi-device piece with live app video ([2cb5fb0](https://github.com/uoplan/uoplan/commit/2cb5fb0328116a5c23caae245468c60a6ad46cc3))
* **marketing:** unify store listings and add deterministic capture harness ([3703044](https://github.com/uoplan/uoplan/commit/37030442753176ebaf66f9a5b57a8506a3b2ee72))
* **native:** allow zero electives and add swipe hint to personalize wizard ([e04b321](https://github.com/uoplan/uoplan/commit/e04b321164dbeca3a6f9c7f1f0ca1922d5acd19e))
* **native:** polish personalize wizard, calendar cart, trends labels, iOS tab bar ([7bd032c](https://github.com/uoplan/uoplan/commit/7bd032c2e13c91c13db9060d43965196da9e7300))
* **schedule:** unify courses-this-semester cap and additional electives ([54ab90f](https://github.com/uoplan/uoplan/commit/54ab90f5140360367778896dc57069d8ca0c55a1))
* update iOS banner to link to the App Store release ([ef7af08](https://github.com/uoplan/uoplan/commit/ef7af08e6de1da16b4b43ff4f44527f135683b8b))
* **web:** add degree planner graph (beta) at /schedule/graph ([5226826](https://github.com/uoplan/uoplan/commit/52268264c7ec5aba25d3e06de83980a82c4af0c7))
* **web:** add features and comparison pages with refreshed SEO ([3922d6e](https://github.com/uoplan/uoplan/commit/3922d6e3c578aca79c6d119ab82b90285554ab2e))
* **web:** prerender and enrich SEO meta for more static pages ([350f3cf](https://github.com/uoplan/uoplan/commit/350f3cfa5b0e123a77438661be9d17a5f5128414))
* **web:** rotate home banner through donation, tester, star, and feedback nudges ([39f33cf](https://github.com/uoplan/uoplan/commit/39f33cfe394e9fdd0c6baaac7ecedbde336015e3))
* **web:** sticky comparison header, zebra striping, and simpler head-to-head ([b2d9407](https://github.com/uoplan/uoplan/commit/b2d94076fc52eb46919aa34e0a50ede23ef8c524))


### Bug Fixes

* **i18n:** label the May-August season as Summer in web trends ([77c03aa](https://github.com/uoplan/uoplan/commit/77c03aa3b053ed76f9ac2dff72425d2421989f9d))
* **marketing:** device poses, captions, materials, and CC BY 4.0 model credits ([16cb91c](https://github.com/uoplan/uoplan/commit/16cb91c545f1385cfb260a43485eb2dce9d13588))
* **marketing:** static iOS clip, upright bigger poses, preload to kill mac flash ([787155c](https://github.com/uoplan/uoplan/commit/787155c0d3ba10325dadf5431e0f10617630aae8))
* serve section pages without trailing slash via drop-trailing-slash html_handling ([01f45a1](https://github.com/uoplan/uoplan/commit/01f45a17bc934344893328ca016f392d1e550fcd))

## [1.0.0-beta.39](https://github.com/uoplan/uoplan/compare/uoplan-monorepo-v1.0.0-beta.38...uoplan-monorepo-v1.0.0-beta.39) (2026-06-28)


### Features

* **native:** interactive choosing-courses chart and truncate biggest-risers label ([85692cd](https://github.com/uoplan/uoplan/commit/85692cdf271ceac2d0ff3505d327271c654c0c4e))
* **native:** make trend charts interactive with tap/drag value tooltips ([80d58d8](https://github.com/uoplan/uoplan/commit/80d58d8dd68852e2197a35cd513d1c3fce1fd124))


### Bug Fixes

* **cli:** match release-please tag scheme (uoplan-v*) for self-update ([5c2403b](https://github.com/uoplan/uoplan/commit/5c2403bcaa172ddae96a66c4960192544f29a7f6))
* **native:** defer onboarding exit with a loading overlay so Skip doesn't freeze ([5700936](https://github.com/uoplan/uoplan/commit/57009362d8c2fa2093517e9179799559da5b0ecd))
* **native:** fix iOS black screen and remove expo-asset metro hack ([8dd8449](https://github.com/uoplan/uoplan/commit/8dd8449cbdff16407e21ba8c70bc604a3f67ae17))
* **native:** show a skeleton on the explore tab while heavy data is deferred ([bd17ff6](https://github.com/uoplan/uoplan/commit/bd17ff6ce633ab203454adf649f3e48570095f9e))
* **native:** truncate leaderboard discipline name so the delta isn't pushed off-screen ([11e6237](https://github.com/uoplan/uoplan/commit/11e62372b7be55984e03917dbbc774a72a70df5f))
* share canonical-aware requirement auto-assignment between web and native ([5a7e7f2](https://github.com/uoplan/uoplan/commit/5a7e7f276324b5940bdea3e1c352d37af7700d6f))

## [1.0.0-beta.38](https://github.com/uoplan/uoplan/compare/uoplan-monorepo-v1.0.0-beta.37...uoplan-monorepo-v1.0.0-beta.38) (2026-06-28)


### Features

* **native:** add a reset button to the personalize wizard ([2d0565c](https://github.com/uoplan/uoplan/commit/2d0565c49bd11124e4d43b25ad6a589926e8fb05))


### Bug Fixes

* **ci:** trigger native deploy on root release_created output (release-please root component is unprefixed) ([4d58ca2](https://github.com/uoplan/uoplan/commit/4d58ca2eb0ba84739f4c304ec08450fe99e0112c))
* **native:** float personalize controls over content instead of an opaque bottom band ([6034aca](https://github.com/uoplan/uoplan/commit/6034aca36bc9415ea18deda4f48294a638093906))
* **native:** only regenerate schedules while the schedule screen is focused ([42b625d](https://github.com/uoplan/uoplan/commit/42b625db3a23888a925dd2fcf3ff3312bd00361e))
* **native:** only show unassigned completed courses on fill-requirements page ([5237620](https://github.com/uoplan/uoplan/commit/5237620f9fe2d9b52c597742e3f9d4c59f95bf0f))
* **web:** give optimization-priority drag handles an accessible name ([c454fc6](https://github.com/uoplan/uoplan/commit/c454fc69ec3002de43a1b39f67324e3c4284457c))

## [1.0.0-beta.37](https://github.com/uoplan/uoplan/compare/uoplan-monorepo-v1.0.0-beta.36...uoplan-monorepo-v1.0.0-beta.37) (2026-06-27)


### Features

* **analytics:** add @uoplan/analytics shared package and posthog deps ([f09e560](https://github.com/uoplan/uoplan/commit/f09e5605ec53bbc21e87c579bfeff82c5c52480e))
* **analytics:** add anonymous posthog product analytics across web and native ([e989493](https://github.com/uoplan/uoplan/commit/e9894936bd50d15da306fbf3dc37c1429da30f2d))
* **analytics:** add native event parity for wizard, explore filters, and donation ([d9fabe6](https://github.com/uoplan/uoplan/commit/d9fabe6ac60749a8fa4d025727ef939e75d822df))
* **analytics:** emit termId and English termName on term events ([253e1a5](https://github.com/uoplan/uoplan/commit/253e1a5ceb27c5be72c281760e8375e5529df7b2))
* **analytics:** emit transcript upload event and track autofill matches ([a3d9ae7](https://github.com/uoplan/uoplan/commit/a3d9ae77d646ca15dd1a39e6ae02c18585e8fc7b))
* **analytics:** enable cross-visit anonymous profiles via persistent storage ([3271024](https://github.com/uoplan/uoplan/commit/3271024b7384f89625560560293bd9dc14dd474f))
* **analytics:** segment generation events by program and academic load ([22fb080](https://github.com/uoplan/uoplan/commit/22fb080a3459e81905b7f8d4df946aedeb058c26))
* **explore:** add course comparison across web and native ([a811977](https://github.com/uoplan/uoplan/commit/a81197755095629280733fccea8415e726e2d39d))
* **schedule:** move generation error details into a dialog ([2f79c67](https://github.com/uoplan/uoplan/commit/2f79c675702edd03ccc81687775443f8fc6e6bb5))
* **schedule:** replace smart options with ordered optimization priorities and unify generation ([e23de13](https://github.com/uoplan/uoplan/commit/e23de1376b109a152a637e405ccafa9935070cf3))
* **web:** add runtime coverage harness for dead-code analysis ([aea1a2e](https://github.com/uoplan/uoplan/commit/aea1a2e4069e773dd7170f0f32cd8458f664f76f))


### Bug Fixes

* **deploy:** use compiled wrangler config for non-prod versions upload ([c8c6c77](https://github.com/uoplan/uoplan/commit/c8c6c7755eb0d39f7aafa031dc6535ed27e27d45))
* **native:** blank launch splash, publish release-please version, enable iOS+Android release CI ([903dec5](https://github.com/uoplan/uoplan/commit/903dec54fcd89ff669dbeedae6f020c8a6edcf9d))
* resolve various mobile bugs ([8ca769b](https://github.com/uoplan/uoplan/commit/8ca769bbd66dd5746c520938381ba7c39c2383d8))
* **web:** resolve node-project typecheck errors in coverage tooling ([84bf51e](https://github.com/uoplan/uoplan/commit/84bf51e2bd0bd7de068e888aa10baa741902a162))

## [1.0.0-beta.36](https://github.com/uoplan/uoplan/compare/uoplan-monorepo-v1.0.0-beta.35...uoplan-monorepo-v1.0.0-beta.36) (2026-06-21)


### Features

* **native:** add week navigation to the schedule control bar ([9704ef5](https://github.com/uoplan/uoplan/commit/9704ef55518de55d928b133a5c554476c6942435))
* **native:** generate schedules lazily with an unbounded next ([d9a4f4c](https://github.com/uoplan/uoplan/commit/d9a4f4c9880dd661f38160b480169714e370ec5c))
* **native:** reach web parity on generation options and restructure the schedule drawer ([b6aaaee](https://github.com/uoplan/uoplan/commit/b6aaaee83bdbb82c3c27474ebb0de8885adc0cf1))
* **schedule:** rework professor rating into a soft section-weighting preference ([595d174](https://github.com/uoplan/uoplan/commit/595d174b234fd288be2c898d82d32dad9db67c55))
* **web:** polish generation options sidebar and raise explore spotlight minimum to 50 students ([3cadf59](https://github.com/uoplan/uoplan/commit/3cadf59b904a065ee53dc4ffbe8b96bff11504cd))


### Bug Fixes

* **a11y:** darken light-theme success green so white CTA text meets WCAG AA ([d59bc70](https://github.com/uoplan/uoplan/commit/d59bc70fd83ebbe3e9d092948e1ee82c7e8911b0))
* **native:** cancel superseded schedule generation and stream variants progressively ([abf93d5](https://github.com/uoplan/uoplan/commit/abf93d5c72d8a5d0cbacb34665e3d10aebad003a))
* **native:** clear basket drawer search when it closes ([dfecfa9](https://github.com/uoplan/uoplan/commit/dfecfa93b39d7e9c833b52ce90e93baa2c57dec3))
* **native:** navigate to existing schedule page instead of pushing a duplicate ([e5736d5](https://github.com/uoplan/uoplan/commit/e5736d53f7c5a42cf3d85e2144352f610396c6da))

## [1.0.0-beta.35](https://github.com/uoplan/uoplan/compare/uoplan-monorepo-v1.0.0-beta.34...uoplan-monorepo-v1.0.0-beta.35) (2026-06-20)


### Features

* add prof prediction reasoning ([f119729](https://github.com/uoplan/uoplan/commit/f11972950ba0250b272fa27e819b85fce8bb5db2))
* enhance cart options ([8920efa](https://github.com/uoplan/uoplan/commit/8920efa7b55dbd9c58f7b25c54a8a56cc34cf591))
* improve document titles ([630886e](https://github.com/uoplan/uoplan/commit/630886e6f76c7d5bb9c798779f6439f06bcf9a3d))
* make explore page show average grade instead of mode ([0f73eb4](https://github.com/uoplan/uoplan/commit/0f73eb423951ba2adba539208acf52cc7ad20a75))
* **mobile:** improve ux and fix bugs ([509ba27](https://github.com/uoplan/uoplan/commit/509ba273e56ca03383cb343a0a6724d824ec770e))
* **mobile:** make native cart and add-to-cart buttons floating ([#64](https://github.com/uoplan/uoplan/issues/64)) ([2cf5baa](https://github.com/uoplan/uoplan/commit/2cf5baa5dd813e1257eff9f1a1104746df61f82f))
* **native:** ship not-affiliated disclaimer + Legal links; align submit appId ([93d2d74](https://github.com/uoplan/uoplan/commit/93d2d74583497c43f099470e73e60869863acee6))
* **web:** add Android closed-test recruitment banner + raise home hero ([09663c5](https://github.com/uoplan/uoplan/commit/09663c57737a914bd6641f6814e9d77da03080c4))
* **web:** host privacy policy and terms pages with footer links ([40e8201](https://github.com/uoplan/uoplan/commit/40e82014a5b61c2aa32b97d4f5527a638fe0edd2))


### Bug Fixes

* avoid priority of honours over chosen course ([0462574](https://github.com/uoplan/uoplan/commit/0462574865b31e095b0f21722a340d27f9f329b1))
* **engine:** schedule timeless courses by data, not just *900 honours rule ([c938ba6](https://github.com/uoplan/uoplan/commit/c938ba6d2c7e2336a86f9630665d205f3a220e80))
* **mobile:** restyle onboarding setup highlights to not look like buttons ([#62](https://github.com/uoplan/uoplan/issues/62)) ([700b86c](https://github.com/uoplan/uoplan/commit/700b86cdc7e78efc63e89460354e828e187d41bc))
* **mobile:** source native program year selector from catalogue years ([#61](https://github.com/uoplan/uoplan/issues/61)) ([8559a82](https://github.com/uoplan/uoplan/commit/8559a8238fafae3e858af1f94a62d36b671a2843))
* **native:** keep course detail single-column on wide tablets ([4579c46](https://github.com/uoplan/uoplan/commit/4579c46c0f0e25393035f6869383fbf36ce8b9f9))
* **native:** single-line search placeholder and non-overlapping banner close button ([#63](https://github.com/uoplan/uoplan/issues/63)) ([2b9043e](https://github.com/uoplan/uoplan/commit/2b9043e68425daa957ed3face341089dd947d5dd))
* stop previously-alias parser from absorbing codes from neighbouring sentences ([#65](https://github.com/uoplan/uoplan/issues/65)) ([16d712f](https://github.com/uoplan/uoplan/commit/16d712ff9a94a38e2462689c0e7f9a84d6114d09))

## [1.0.0-beta.34](https://github.com/uoplan/uoplan/compare/uoplan-monorepo-v1.0.0-beta.33...uoplan-monorepo-v1.0.0-beta.34) (2026-06-15)


### Features

* add faculties ([8909e46](https://github.com/uoplan/uoplan/commit/8909e46e26fd74611c7265b75a1056c98a4bdb90))
* add faculty explore page ([2cb484a](https://github.com/uoplan/uoplan/commit/2cb484a3911679f0d871ba195e04b4e9629f098c))
* add more mobile functionality ([f1c184f](https://github.com/uoplan/uoplan/commit/f1c184f02668e84c0249b0a27f7554e6d5ad4e6c))
* begin work on splitting up web and app ([2dbcdcd](https://github.com/uoplan/uoplan/commit/2dbcdcd317a92b62b7e0c36cf6599a06fb14dc81))
* **engine:** native FFI bindings (iOS/Android) and rustfmt test imports ([c741434](https://github.com/uoplan/uoplan/commit/c741434153388aae545838f526539a309d03eb3d))
* implement most shared components ([87681bf](https://github.com/uoplan/uoplan/commit/87681bfd030638941df7514afe594051fa6a3409))
* improve footer ([95a98a1](https://github.com/uoplan/uoplan/commit/95a98a1cd31bf558790f062cbfa22a2f527edd8b))
* include courses with no grade or schedule data ([551008a](https://github.com/uoplan/uoplan/commit/551008ad0096d9434d910da3e190298fedbe1a10))
* **native:** iOS and Android app ([1257255](https://github.com/uoplan/uoplan/commit/1257255b708ac01ca2191dbbb2a322c14c3de0b3))
* **ui:** cross-platform UI primitives shared by web and native ([b3428c1](https://github.com/uoplan/uoplan/commit/b3428c140cc4e6312618628b6dcadf74735d2666))
* **web:** basket, course pages and schedule-sidebar improvements ([b7690f1](https://github.com/uoplan/uoplan/commit/b7690f1049aac9a2117d68476989bd2f01287f1e))
* **web:** persistent black 'change personalization' banner on explore + lift spotlight rows ([5c13f64](https://github.com/uoplan/uoplan/commit/5c13f6421985faf6270da5669220dd6089cbc43c))


### Bug Fixes

* reduce footer gap ([898996d](https://github.com/uoplan/uoplan/commit/898996d8cc0c2fb30a524a9b299ebf8fff48d16b))

## [1.0.0-beta.33](https://github.com/uoplan/uoplan/compare/uoplan-monorepo-v1.0.0-beta.32...uoplan-monorepo-v1.0.0-beta.33) (2026-06-13)


### Features

* add better personalization banner in sidebar ([f4ae2a8](https://github.com/uoplan/uoplan/commit/f4ae2a85e8348be10948f12a78285bd70f986a20))
* add code coverage ([9295e31](https://github.com/uoplan/uoplan/commit/9295e31e7d0988881844c987943c286ec8b3ca8a))
* add colour to home page ([856c95f](https://github.com/uoplan/uoplan/commit/856c95f56d68dfe1f4ad9006762ca4c22add03af))
* add dropped count to grades ([1cb524e](https://github.com/uoplan/uoplan/commit/1cb524e9c2081c46643e9f82064db376e9ee2ef0))
* add drops to grade viz, extend height of hover area ([1723fbf](https://github.com/uoplan/uoplan/commit/1723fbffe863e5006514bc38c05f7f4cae9b972f))
* add filtering for explore course and prof pages ([687b241](https://github.com/uoplan/uoplan/commit/687b24125e567b9789e5170e5a0998d5f2400ab6))
* add global course cart ([78bdd21](https://github.com/uoplan/uoplan/commit/78bdd21f85c5a7e96b2940b79fdedd5a9b9f1014))
* add more consistent ratings for rmp and satisfaction ([e02569c](https://github.com/uoplan/uoplan/commit/e02569cdd1cbb2e92a84415cf2be8787afd98c1f))
* add skeleton loaders to explore page ([fb21ffd](https://github.com/uoplan/uoplan/commit/fb21ffd01931e94df43725e10b654216c70f9657))
* do not filter out terms from remaining profs ([bc9322c](https://github.com/uoplan/uoplan/commit/bc9322cdaecfd718f39aba80996a13bde2465b30))
* improve add to basket button ([13ab53d](https://github.com/uoplan/uoplan/commit/13ab53d171e7991c5168e3ab12ff0bc6251817f8))
* improve consistency and spacing of rating popovers ([b6c6a46](https://github.com/uoplan/uoplan/commit/b6c6a462a154f4ad85d9b47e11241ef91ad9fab1))
* improve type safety with branded types ([6f0f755](https://github.com/uoplan/uoplan/commit/6f0f7550ed99a5150ce19f09d1917663ff554cad))
* increase border radii ([9424344](https://github.com/uoplan/uoplan/commit/9424344cc79f742ae497ecfe5a53b0c177921751))
* make layout more consistent ([a3078ca](https://github.com/uoplan/uoplan/commit/a3078ca317ee6d95acde030c8332767f8e4a85a0))
* make ratings consistent on explore page ([53c9da2](https://github.com/uoplan/uoplan/commit/53c9da236cadd6f4351520d1f4fb8ce9c7899b1b))
* reduce footprint of pb files by packing with soa ([cfc88a7](https://github.com/uoplan/uoplan/commit/cfc88a7acf2b8d06699bd6fcd4d3ad42c9be6d3d))
* reduce size of proto data ([b166ac2](https://github.com/uoplan/uoplan/commit/b166ac286d6c0f016204d9500b351432697c576a))
* use nicer colours ([5805d53](https://github.com/uoplan/uoplan/commit/5805d53422f30e77726c5cd5452040501dc02036))


### Bug Fixes

* ci ([d61c639](https://github.com/uoplan/uoplan/commit/d61c639d6fe8edac4e82f68a3d1ccd5b449b565f))
* resolve race condition with option selections ([edf4755](https://github.com/uoplan/uoplan/commit/edf47554cbae9669c2512d85a7ad9982a59e3201))
* show proper text for no program selected ([11b3ebc](https://github.com/uoplan/uoplan/commit/11b3ebcafa62b081103b3751b3506a2b82412081))
* stay on page when changing trends options ([fdc5963](https://github.com/uoplan/uoplan/commit/fdc5963dd03957876df726921e9b3dd160555ad6))
* sync lockfile after removing worker esbuild dep ([c18344c](https://github.com/uoplan/uoplan/commit/c18344ceb07dd42e0be44e137859a1576223e1b9))
* use proper back button labels and handling ([9a5545c](https://github.com/uoplan/uoplan/commit/9a5545c7d4f94f7370e8cdda83b759f8f7afff82))
* use proper colour for switch ring ([1e248cc](https://github.com/uoplan/uoplan/commit/1e248cca68eb5046373cceffef6966c3ed3b2dcd))
* various mobile bug fixes ([4020e66](https://github.com/uoplan/uoplan/commit/4020e660cdb34e6a2eec3e7b205c64a7cf5e2dba))
* **web:** shared BottomDrawer fixes full-width mobile sheet + bg leak ([40f2e55](https://github.com/uoplan/uoplan/commit/40f2e5521bf66340b43fee614d32f5263c6712e6))

## [1.0.0-beta.32](https://github.com/uoplan/uoplan/compare/uoplan-monorepo-v1.0.0-beta.31...uoplan-monorepo-v1.0.0-beta.32) (2026-06-10)


### Features

* add better charts for feedback trends ([659b42c](https://github.com/uoplan/uoplan/commit/659b42cca030fde016c2534a0f17974a31ec6fc7))
* add donation banner to home page ([a77cd03](https://github.com/uoplan/uoplan/commit/a77cd033680d0751b2457988580e31304b6ca455))
* add donation page wip ([2c9a153](https://github.com/uoplan/uoplan/commit/2c9a1539ed3ad5c0ca67ef09a8c5de1aae554c34))
* add reason to donation page, clean it up ([5c86db9](https://github.com/uoplan/uoplan/commit/5c86db9a1244c1541d1bcf3c2fdd896e67c39ba1))
* canonicalize and centralize prof names ([c008a70](https://github.com/uoplan/uoplan/commit/c008a70e0f3d7d234d5f8850bd3d4bdc628dbf47))
* count up donation number ([78b2131](https://github.com/uoplan/uoplan/commit/78b2131b599868308b640a0f0a379f196b9fa708))
* improve donation complete message ([4617af1](https://github.com/uoplan/uoplan/commit/4617af17ee9142b1d7fd4d42de6bed8707cacf7a))
* make banner mobile-friendly ([b9ec83f](https://github.com/uoplan/uoplan/commit/b9ec83f35acd6ceb1a1d23bafdf46e73a3bc71e3))
* make geegees theme public instead of an easter egg ([9e5c140](https://github.com/uoplan/uoplan/commit/9e5c1400a7deb0bbb5eb32e96f8e8b9978cdf2c7))
* remove easter egg, use nicer colours ([28b70e6](https://github.com/uoplan/uoplan/commit/28b70e6fa7e1f60db7828887f2868fc79662070b))
* switch to cloudflare/vite-plugin ([a60944f](https://github.com/uoplan/uoplan/commit/a60944fe7194b67d8080e47b6ddd033938846565))
* **worker:** forward inbound email to inbox after donation inspection ([7b65987](https://github.com/uoplan/uoplan/commit/7b6598779471e1f40a2d0e8f9282f33ca400e18c))


### Bug Fixes

* a11y test ([bb2406b](https://github.com/uoplan/uoplan/commit/bb2406b4b7022dc64147edeeca04f2f3c8c21cc0))
* use proper colours for themes ([292c985](https://github.com/uoplan/uoplan/commit/292c985f570b254ab4f34a138cf8555c93bf5844))

## [1.0.0-beta.31](https://github.com/uoplan/uoplan/compare/uoplan-monorepo-v1.0.0-beta.30...uoplan-monorepo-v1.0.0-beta.31) (2026-06-09)


### Features

* add bloat gate, a11y coverage ([c60bc43](https://github.com/uoplan/uoplan/commit/c60bc43da30a2958bab6861c5d01164ba24933bd))
* add course times to explore page ([0e2c2bf](https://github.com/uoplan/uoplan/commit/0e2c2bf3abde3b876a3f0ef3e0719f2c069e6cae))
* add external link for courses ([2fc9085](https://github.com/uoplan/uoplan/commit/2fc90856a5a180211cadc3d9b1388ff7565e02fa))
* add feedback options in popover for small screens ([ef287d6](https://github.com/uoplan/uoplan/commit/ef287d6aa5c02e4d0cd051a17efb3a18d214438d))
* add full-bleed for explore page filter bar ([a8521fc](https://github.com/uoplan/uoplan/commit/a8521fcc6ff5907ea75f6102275795fed0dcc59b))
* add professor predictions when none is assigned yet ([3054939](https://github.com/uoplan/uoplan/commit/3054939b46a3745a04fb103f5622677ed88ea240))
* add tooltip to feedback options ([5097820](https://github.com/uoplan/uoplan/commit/5097820e548fd0505d73510d933b199af5bd4e46))
* add trends button on the top ([4c775d2](https://github.com/uoplan/uoplan/commit/4c775d2aecbb83f1d96ebca4514f22f79197ac2c))
* group trends into categories ([59105a3](https://github.com/uoplan/uoplan/commit/59105a3306990480b4dfc48ae0cfad04bb454f3f))
* improve accessibility ([9275230](https://github.com/uoplan/uoplan/commit/9275230bbac08931701af52ec954d0d10a288552))
* improve prof matching for grades ([cd88b40](https://github.com/uoplan/uoplan/commit/cd88b40909ef8d7413513023f6a5e5e69bfb4158))
* improve rating display on calendar ([bd1875d](https://github.com/uoplan/uoplan/commit/bd1875d207ea25a275c848cf0ea2f922087c6b05))
* improve warning for notifications being disabled ([28df006](https://github.com/uoplan/uoplan/commit/28df006e9c2c99ef78e6b9bc965b3de74155e020))
* reduce eager data loading ([7b7af0d](https://github.com/uoplan/uoplan/commit/7b7af0d419cc206d89c0694686500c2c6bb26208))
* slim down trends filter ([f0f9a7f](https://github.com/uoplan/uoplan/commit/f0f9a7fb0e661c41d6c61a53c14609367ef05158))
* use better skeleton loader for trends ([0df6c97](https://github.com/uoplan/uoplan/commit/0df6c9702327b179fd6c8fc3179ac2e087d71150))
* use oklch for colour ([d5a08b1](https://github.com/uoplan/uoplan/commit/d5a08b19c49ec44c18ab50d48bb4fd7af57f6787))
* use satisfaction instead of ratemyprof for main numbers ([b8eac87](https://github.com/uoplan/uoplan/commit/b8eac871541be5398acd7650ef3f5cf2bda359a6))


### Bug Fixes

* bucket levels into 5000+ ([9f93e98](https://github.com/uoplan/uoplan/commit/9f93e98187ebeb706a0c31fe3eae9ce2c3687801))
* make budgets better for test timing ([432e2f1](https://github.com/uoplan/uoplan/commit/432e2f1a7f566b047f96fe40891ec0bab72d4ea0))
* resolve drawer issue on mobile explore page ([7575270](https://github.com/uoplan/uoplan/commit/75752702bdb77cff0263b98245abb63aec6571d3))
* resolve some bugs ([4c51e9f](https://github.com/uoplan/uoplan/commit/4c51e9f19298020f4a2d3a52be54ab1394020d92))
* use correct padding for command center ([ca41d85](https://github.com/uoplan/uoplan/commit/ca41d85cc05eba9b6b7f2d1f98f2c9be137cad97))


### Performance Improvements

* add prefetching ([ce0d534](https://github.com/uoplan/uoplan/commit/ce0d53455b25c45fddead9d065d2936782815a20))

## [1.0.0-beta.30](https://github.com/uoplan/uoplan/compare/uoplan-monorepo-v1.0.0-beta.29...uoplan-monorepo-v1.0.0-beta.30) (2026-06-07)


### Features

* add discipline filter to explore page ([cd98e53](https://github.com/uoplan/uoplan/commit/cd98e538d715aac06ae19428fd19dfe8d648abf9))
* add easter eggs ([1c5a0bd](https://github.com/uoplan/uoplan/commit/1c5a0bdcd5d6903e7f7113f7eabf6ee3ef98e720))
* add feedback data to explore and trends pages ([1c98415](https://github.com/uoplan/uoplan/commit/1c984153b34f7f723159857654fd08f5d5183d37))
* add feedback filter and generation option ([5640259](https://github.com/uoplan/uoplan/commit/56402590382470563c67415bcd5d9070ae12efbb))
* add feedback sort on explore page ([6e5cdab](https://github.com/uoplan/uoplan/commit/6e5cdab983adf7aa3d69d8752b1dc43130a3e15d))
* add fullscreen button to calendar event popover ([626fee0](https://github.com/uoplan/uoplan/commit/626fee0e78c46fb0b71adfb4c6cd7d7107727f4c))
* add more data to trends page ([bfee344](https://github.com/uoplan/uoplan/commit/bfee34448b42c11b99f009f5d8c5c4fe6656f8ee))
* add parsing for feedback forms ([0209fc0](https://github.com/uoplan/uoplan/commit/0209fc0fc20e96fea8b7789cd456c793a60cd7a6))
* add scraper for feedback forms ([1ef2906](https://github.com/uoplan/uoplan/commit/1ef2906139413eec943d0e67bed3493d1b0c4cdb))
* add term filter to explore page ([6248265](https://github.com/uoplan/uoplan/commit/6248265cad4baea0f08c902f34b7fcc6061a539e))
* **calendar:** list scheduled courses without time slots ([5f8344f](https://github.com/uoplan/uoplan/commit/5f8344f0668e3eecf3eab0f978cb320312191092))
* **calendar:** reorganize basic sidebar by option frequency ([119d68f](https://github.com/uoplan/uoplan/commit/119d68f8428489117d577bd1448e042eecbbf54c))
* cancel pending generation if options change ([4eec4e2](https://github.com/uoplan/uoplan/commit/4eec4e207ef490c6fb03be8b4950b0f5317b73d8))
* improve cachability of protobuf data ([c92ac9d](https://github.com/uoplan/uoplan/commit/c92ac9d8082595caf3855fd46068488a321dacfe))
* improve layout of feedback explore page ([a02af86](https://github.com/uoplan/uoplan/commit/a02af86a6ac8cc87334ecb95a982220e70d9a1ef))
* improve schedule generator to be more consistent ([ebab29e](https://github.com/uoplan/uoplan/commit/ebab29e5151e6d6a54f0426ce6b33745f40bec67))
* increase course limit, add generation timeout ([49fe61b](https://github.com/uoplan/uoplan/commit/49fe61b658a97dd349d922621748e8406e5773f5))
* make week preview sidebar resizeable ([4fbca1c](https://github.com/uoplan/uoplan/commit/4fbca1cd8303a4ee48f3c4554cc0a0c38acdbe71))
* only show most popular week in worker og-image ([5bbf43c](https://github.com/uoplan/uoplan/commit/5bbf43c9c852d8c70106b739ece251c6c6d961c3))
* reduce bundle sizes ([65b9c5b](https://github.com/uoplan/uoplan/commit/65b9c5b32a3366c7a86c238c7da2cfd427f4ff82))
* rewrite schedule generator in rust ([c189923](https://github.com/uoplan/uoplan/commit/c18992360f85f9024ddfd964ca1f0861d8a04e27))
* **schedule:** refine repeatable courses and auto-enable FLS stream ([783daa3](https://github.com/uoplan/uoplan/commit/783daa3ac05ea868dac5ab3c6fedfef7110558b4))
* shrink schedule generator binary size ([a9240d3](https://github.com/uoplan/uoplan/commit/a9240d3d57fd864fc6c86c1dde4f7bbb66a2596c))
* simplify url params for explore page ([fc16286](https://github.com/uoplan/uoplan/commit/fc162866d729d9e455a52b4edb99b8693644c942))
* use better scrollbar ([fe7638d](https://github.com/uoplan/uoplan/commit/fe7638d05174165c1388d1863d9a04da14756af3))
* use better sorting for searching disciplines ([1a6ccc0](https://github.com/uoplan/uoplan/commit/1a6ccc07b633990fc96348abb407eade2688a5df))
* use secondary state for fast og-image rendering ([90ca97d](https://github.com/uoplan/uoplan/commit/90ca97ddd13f44941aa74d8c46936b7b971cb005))
* virtualize course lists ([546a016](https://github.com/uoplan/uoplan/commit/546a016e0c536193947ffc4a3102a913cb1d0656))


### Bug Fixes

* add all of the features the user misses out on with basic mode ([89bbb48](https://github.com/uoplan/uoplan/commit/89bbb48c5d4ed5dc2ce95a211a89e4be6f4ae500))
* **calendar:** only offer swap candidates that fit the schedule ([cd668aa](https://github.com/uoplan/uoplan/commit/cd668aa4e16685fa29433e20f343dc03989abc2a))
* cancel generation on option change in subsequent runs ([5fc5cd4](https://github.com/uoplan/uoplan/commit/5fc5cd452472f70bbdba5b6602891784a3d1ec59))
* **ci:** make tests pass, build wasm-bindgen ([d1dbeef](https://github.com/uoplan/uoplan/commit/d1dbeef47056647a1ab3cbc6da73747dd98b3522))
* include courses with no prof in explore ([bbe3696](https://github.com/uoplan/uoplan/commit/bbe3696b9a0d1a7b113b9411267a5f8a95fc02e0))
* keep existing schedule if generation fails ([a2c0aa0](https://github.com/uoplan/uoplan/commit/a2c0aa00d6174db61396294be52ef0e793536628))
* **share:** load shared schedule immediately when none generated ([8952426](https://github.com/uoplan/uoplan/commit/89524266d2f7e4875bc4885980657d9db81bd226))
* **share:** make shared load destructive and keep actions inline ([6133983](https://github.com/uoplan/uoplan/commit/6133983b84b6d73933ea36346abc9b7714585150))
* show checkmarks on explore page ([0653324](https://github.com/uoplan/uoplan/commit/0653324737393952e19311a912985b58b11834cc))
* use basic generator on load when needed, default to 5 courses ([3cb4a55](https://github.com/uoplan/uoplan/commit/3cb4a5597095e4771edf7fd820e584bee95a090b))
* use better script to setup cloudflare ci ([7dbd569](https://github.com/uoplan/uoplan/commit/7dbd569d5297b3bcbb12269ca5ae7713d3c2ffa7))


### Performance Improvements

* improve performance of schedule generator ([5c11dc6](https://github.com/uoplan/uoplan/commit/5c11dc6358a2c103b5d68fab49ed1c9bb60e1fe4))
* memoize calendar popover ([7d398f5](https://github.com/uoplan/uoplan/commit/7d398f5219c7a1f1cc0c23ce9506876d541f0db8))
* speed up schedule generation algorithm ([e22fdf3](https://github.com/uoplan/uoplan/commit/e22fdf3bf9395f21a65722aaf04d3d219098adf9))

## [1.0.0-beta.29](https://github.com/uoplan/uoplan/compare/uoplan-monorepo-v1.0.0-beta.28...uoplan-monorepo-v1.0.0-beta.29) (2026-06-03)


### Features

* add advanced priority scheduling ([d9a4c74](https://github.com/uoplan/uoplan/commit/d9a4c744084bfec50e0c6062bf895ff3cee4e343))
* add hover card to calendar, improve animation ([3211e70](https://github.com/uoplan/uoplan/commit/3211e70e86988901cc0ea6331db5754b6e0e2a47))
* allow fls courses to be chosen multiple times ([89cf9f2](https://github.com/uoplan/uoplan/commit/89cf9f2d2e40d4c0e8589cb9bbb23768285b87e3))
* integrate swap panel back into the popover ([7df4b2f](https://github.com/uoplan/uoplan/commit/7df4b2fc9115a6ab2c22161c4a89ce83fcfcc743))
* move scrollbar outside of content in desktop popover ([d6ea0ad](https://github.com/uoplan/uoplan/commit/d6ea0ada54670ba7accde3b91ab3072ef622aaf8))

## [1.0.0-beta.28](https://github.com/uoplan/uoplan/compare/uoplan-monorepo-v1.0.0-beta.27...uoplan-monorepo-v1.0.0-beta.28) (2026-06-01)


### Features

* add aliases to explore page ([c81bfd4](https://github.com/uoplan/uoplan/commit/c81bfd427167acab3ba8540fbf7a3ef49323d680))
* add links to explore from trends, add programs to explore ([c93470b](https://github.com/uoplan/uoplan/commit/c93470b89fcbdd65518458d4b3954aa8472d3b8a))
* add progress to pill on home page ([5054b15](https://github.com/uoplan/uoplan/commit/5054b150968f93b577c7f83a94319ac0e02e5938))
* add toast notifications and error boundary ([f6d0fcd](https://github.com/uoplan/uoplan/commit/f6d0fcdbe21c92c57053a694a816b5bea743a61a))
* improve accessibility of calendar and requirements ([898aaea](https://github.com/uoplan/uoplan/commit/898aaea863d3b14655513e6f55c751e303d7f85a))
* improve placeholder grade data, filter out fake profs ([3363b2e](https://github.com/uoplan/uoplan/commit/3363b2ec1aeddb2ec30a33720991a2c2090956e2))
* make term formatting consistent ([da6db64](https://github.com/uoplan/uoplan/commit/da6db64ed79552b4b6737a5c4297db2197f371b5))
* make trends page mobile-friendly ([196bc9b](https://github.com/uoplan/uoplan/commit/196bc9ba393ef024286b311d8f51601a280065f8))
* show dirty state for calendar generation, do not regenerate when blocking times ([0934bfb](https://github.com/uoplan/uoplan/commit/0934bfbfa5d47169a721a9ea2ebb51275e817df9))
* show no rating instead of 0 for ratemyprof ([78782be](https://github.com/uoplan/uoplan/commit/78782be8be8d1f8a6883bbe1a38abf5777fda928))


### Bug Fixes

* align grade placeholder with real ([596b36a](https://github.com/uoplan/uoplan/commit/596b36a2fe0a31b4fb0016a6f1888bc56f862874))
* make progress bar continue after changing cards ([0f8dcd3](https://github.com/uoplan/uoplan/commit/0f8dcd386f74fd358fe5e369d1cf3a6e5959a0d2))
* reset seed when options are dirty ([24d40ef](https://github.com/uoplan/uoplan/commit/24d40ef2421be280f05f38b53b60cca5c68ed3ba))
* resolve build issues ([ec9c0ef](https://github.com/uoplan/uoplan/commit/ec9c0efaea8535482f7764894770a5aa7de342f4))
* use proper document title for courses on explore page ([006a5c2](https://github.com/uoplan/uoplan/commit/006a5c2e81a467b4e16db9f61598d84fc30ad180))

## [1.0.0-beta.27](https://github.com/uoplan/uoplan/compare/uoplan-monorepo-v1.0.0-beta.26...uoplan-monorepo-v1.0.0-beta.27) (2026-06-01)


### Features

* add shortcuts ([5c73e14](https://github.com/uoplan/uoplan/commit/5c73e14d3bc68c1451449f0ada3025ece1db226e))
* filter course table by program in trends page ([347527a](https://github.com/uoplan/uoplan/commit/347527a81d9067ad648c6359dd50fd33630d5f92))
* improve ux for calendar ([58ee2d4](https://github.com/uoplan/uoplan/commit/58ee2d4fbe6988d5347d82fdac67f67a561b527e))
* reduce lag when resizing calendar sidebar ([a1d258f](https://github.com/uoplan/uoplan/commit/a1d258fb7288375b8c4d5010ea28d67424333c95))
* reduce nesting for requirements ([980677f](https://github.com/uoplan/uoplan/commit/980677fd41d0408cea10de38a829a23bc2047e97))
* reorder calendar sidebar ([4ff41e0](https://github.com/uoplan/uoplan/commit/4ff41e02c8375078882e07f942de4aed05c14dd3))
* unify blocked time slot options ([e7d46f2](https://github.com/uoplan/uoplan/commit/e7d46f27661205b2da2e004d9cec07a52ab4f22c))


### Bug Fixes

* correctly parse options ([f567435](https://github.com/uoplan/uoplan/commit/f567435061cc35f15b9b269d7a524bacabb6fbd7))
* filter out staff from explore page ([82adbb2](https://github.com/uoplan/uoplan/commit/82adbb2ca0301534d14cd8346140615f21e172ff))
* **i18n:** restore translation catalogs and replace broken lingui extract ([3565e49](https://github.com/uoplan/uoplan/commit/3565e4927d7d6fff7e75fb9962ab6b7d054481ab))
* make ux more consistent ([c1c57c2](https://github.com/uoplan/uoplan/commit/c1c57c2b572bd404400a1d60d9d29117958d1087))
* remove extra gap in calendar on mobile ([d5bbf78](https://github.com/uoplan/uoplan/commit/d5bbf78af4668a20653cb4b79cf3da449f33630a))
* use proper corners for calendar preview ([fa49d01](https://github.com/uoplan/uoplan/commit/fa49d0198a9953c9b88e0dcc7c574cfe728b8688))
* wait for loading before redirecting on explore page ([8a94f65](https://github.com/uoplan/uoplan/commit/8a94f6584aa2a6ce0bf5cdcd47f52eeccbd556d0))

## [1.0.0-beta.26](https://github.com/uoplan/uoplan/compare/uoplan-monorepo-v1.0.0-beta.25...uoplan-monorepo-v1.0.0-beta.26) (2026-05-31)


### Features

* add clear button to calendar ([07cf4e8](https://github.com/uoplan/uoplan/commit/07cf4e84d5594169ee6faf6f4486fcab65bd02ae))
* add icon animations ([094956a](https://github.com/uoplan/uoplan/commit/094956a6dc33697d8cbabaec5a611d1ce273ecaa))
* add number animations on trends page ([4595ff7](https://github.com/uoplan/uoplan/commit/4595ff798a4e35d912ac0b4472937681dc778d4b))
* add program filter to trends page ([53e9ed6](https://github.com/uoplan/uoplan/commit/53e9ed6c695310ac0ce5e9c0768386faee834e74))
* add time blocking to the calendar ([03c462a](https://github.com/uoplan/uoplan/commit/03c462a51d7fdef7e3cf5152a72f40cb497d970a))
* add trends page ([f002888](https://github.com/uoplan/uoplan/commit/f0028889044592b72f2b940c18be1809c3da22b9))
* improve spacing for program options ([f9d75ea](https://github.com/uoplan/uoplan/commit/f9d75ea3f983b339815dca05c61890820addf82b))
* use a softer theme ([5cf20d3](https://github.com/uoplan/uoplan/commit/5cf20d3141602b3c429aa2a412504d0d00411e5e))
* wait for schedule generation before loading calendar page ([6ccfde8](https://github.com/uoplan/uoplan/commit/6ccfde838586e7f04a5b7442c2f12a6a4c6338c6))


### Bug Fixes

* reduce corners on event cards, some overflow issues ([0bb834f](https://github.com/uoplan/uoplan/commit/0bb834f332657de6c1c139dd937ec9a5557591ad))
* skip to busiest week with uenroll import ([44d7f28](https://github.com/uoplan/uoplan/commit/44d7f28854c0e4f15f3ff9a74c27f3860e604c4d))

## [1.0.0-beta.25](https://github.com/uoplan/uoplan/compare/uoplan-monorepo-v1.0.0-beta.24...uoplan-monorepo-v1.0.0-beta.25) (2026-05-31)


### Features

* add ical library for generating calendars ([206dcd4](https://github.com/uoplan/uoplan/commit/206dcd486d40a163aefe1cb08b83f7292afe5446))
* add progress bar when loading pages ([9baef15](https://github.com/uoplan/uoplan/commit/9baef153c5c433396a757ce8489761ad8dabf731))
* improve generation button on schedule ([13a0283](https://github.com/uoplan/uoplan/commit/13a0283af6547d49daa8ee88b1d8a94a9392b1bf))
* improve generation error messages ([7df81e0](https://github.com/uoplan/uoplan/commit/7df81e05b11dd3365ac93e2c01c77829bdd83c30))
* improve layout of language and theme dropdowns on mobile ([91849bf](https://github.com/uoplan/uoplan/commit/91849bf864f44c04c91411feee565f8d8c546432))
* improve perf of explore page ([074900f](https://github.com/uoplan/uoplan/commit/074900fcfbc87238bf96bac5873868f3971b4f3c))
* move schedule and explore page out of beta ([991ae4f](https://github.com/uoplan/uoplan/commit/991ae4f68e1c42bc16ee8ad8daebc3bb34c2eec1))
* rewrite generation engine ([028e3cd](https://github.com/uoplan/uoplan/commit/028e3cd49dd9419c643a0bd8f66154a408938feb))
* **scraper:** rewrite scraper app and improve requirements parsing ([bd53b26](https://github.com/uoplan/uoplan/commit/bd53b26e53319d933b1acfc3252eca95e9d9014a))
* **scraper:** speed up schedule scraper ([0308395](https://github.com/uoplan/uoplan/commit/03083958dfaced68e6c2ee5afe4e210d753d3840))
* share colour map between worker and web ([ebbb07a](https://github.com/uoplan/uoplan/commit/ebbb07a6f9a49296c29f31e674683b8aef284a60))


### Bug Fixes

* avoid bad animations for calendar ([dfadb5d](https://github.com/uoplan/uoplan/commit/dfadb5df9fae3b87780a759e0a122fb512a5eeee))
* do not show generation error multiple times in a row ([1750e01](https://github.com/uoplan/uoplan/commit/1750e01bc67e7a38460275d12fd56ab8169678df))
* parse more requirements properly ([a8511ec](https://github.com/uoplan/uoplan/commit/a8511ecbd1ffe2c60d5d96cf61fa732669f4df5a))
* use correct branch and versioning env var ([209a7d2](https://github.com/uoplan/uoplan/commit/209a7d288808945c2c9b2868130bb4287a68cd56))

## [1.0.0-beta.24](https://github.com/uoplan/uoplan/compare/uoplan-monorepo-v1.0.0-beta.23...uoplan-monorepo-v1.0.0-beta.24) (2026-05-29)


### ⚠ BREAKING CHANGES

* **web:** split code into modules, add browser tests, rework proto

### Features

* add consistent back button ([904772d](https://github.com/uoplan/uoplan/commit/904772dd1685062c58f3d7f8080c0b6faae484c4))
* add light theme ([abbacc1](https://github.com/uoplan/uoplan/commit/abbacc1e8a0c15e921fd046f5428a358500c2afb))
* add oxlint plugin for missing translations ([b7b59df](https://github.com/uoplan/uoplan/commit/b7b59df9b7c13acc5bab0ff2dd532ce741451ea6))
* add seed skipping when using previous button ([9860315](https://github.com/uoplan/uoplan/commit/9860315691a47908885518815aa9c7ef7f373fb4))
* add types to service worker ([484efd2](https://github.com/uoplan/uoplan/commit/484efd2eca320ecdf95c8bb9900edd35cd83e1f9))
* clean up multiselect labels ([f94e33b](https://github.com/uoplan/uoplan/commit/f94e33bf1e6085b6461eab65d4cae40f96af147f))
* improve design for schedule ([7960e3e](https://github.com/uoplan/uoplan/commit/7960e3e914164597fb40ee28056c9d83fc14c9d7))
* improve document title on graph page ([08dbc15](https://github.com/uoplan/uoplan/commit/08dbc151277659016d48be595c2630b521a3388c))
* move all schedule steps into one page ([163bf0c](https://github.com/uoplan/uoplan/commit/163bf0cffee7939cc1b3d6bc3e6cf0fc8dada30a))
* move generation to worker ([ae79d22](https://github.com/uoplan/uoplan/commit/ae79d2252561a9c1dedca343bf72718e9d3150c6))


### Bug Fixes

* **ci:** make src/generated before running protoc ([6aa7f37](https://github.com/uoplan/uoplan/commit/6aa7f3713d5f7ac45237defa680d95d098b50220))
* course explorer lag, redirect loop ([99b27d4](https://github.com/uoplan/uoplan/commit/99b27d43f572f928853662f44233aaffc69d63c4))
* do not hide buttons when generation fails ([8d71454](https://github.com/uoplan/uoplan/commit/8d7145451f7ddd37322ca8645e7b04b953a21dad))


### Code Refactoring

* **web:** split code into modules, add browser tests, rework proto ([1efa04c](https://github.com/uoplan/uoplan/commit/1efa04ce67d515f59081e6e67e4fcc4872987a26))

## [1.0.0-beta.23](https://github.com/uoplan/uoplan/compare/uoplan-monorepo-v1.0.0-beta.22...uoplan-monorepo-v1.0.0-beta.23) (2026-05-27)


### Features

* add dynamic og-image for schedule preview ([45bda15](https://github.com/uoplan/uoplan/commit/45bda15517f83874c3d06a5cdd688c3df837773c))
* improve og-image generation ([a74f771](https://github.com/uoplan/uoplan/commit/a74f771e71021947f0b0e0bc0c899a82bdf75fd5))
* move worker to use hono ([fde2b6d](https://github.com/uoplan/uoplan/commit/fde2b6d61125c4dfab0f662f8701943d20945c60))
* sync og-image with real calendar, improve calendar generation randomization" ([093d836](https://github.com/uoplan/uoplan/commit/093d83652c18a5770410b1f5157ed760b746a7cb))


### Bug Fixes

* **ci:** trigger CLI release from release-please via workflow_call ([5c85262](https://github.com/uoplan/uoplan/commit/5c85262ea476b23e473b318f573c147d3392df0a))
* loosen test to allow skipping schedules ([16e930e](https://github.com/uoplan/uoplan/commit/16e930eb8e7b8ce97953fc7925634b08a04a462c))
* **og-image:** use proper bold font ([b31c7d9](https://github.com/uoplan/uoplan/commit/b31c7d9a216a9dc066d54e290e11d6063f17548b))
* stable schedule sharing ([7d78c58](https://github.com/uoplan/uoplan/commit/7d78c58c129ef387b9e4f868f50d4fafd282b35d))

## [1.0.0-beta.22](https://github.com/uoplan/uoplan/compare/uoplan-monorepo-v1.0.0-beta.21...uoplan-monorepo-v1.0.0-beta.22) (2026-05-25)


### Features

* improve course swap page ([8e75091](https://github.com/uoplan/uoplan/commit/8e75091737c2f293a6a602b699ab2c5ea419687d))
* show save indicator on calendar page ([1e129dc](https://github.com/uoplan/uoplan/commit/1e129dcf2e61eb1f699d4f46c24f538544dcd2e2))


### Bug Fixes

* apply locked course to most specific available requirement ([e003968](https://github.com/uoplan/uoplan/commit/e0039684ec0cc5e5a7e0421f176690be46a0c9a9))
* **ci:** explicitly publish release as non-draft ([f9e6530](https://github.com/uoplan/uoplan/commit/f9e65307a4768a2c6b9101c1e1d014514212c6dd))
* **ci:** use correct cli tag ([74ad265](https://github.com/uoplan/uoplan/commit/74ad26535468b00568de7af18fd74fa4ddc3eb7b))
* **cli:** update readme ([469e3c4](https://github.com/uoplan/uoplan/commit/469e3c411b71c775f4c211a00f3b3977302ab160))
* persist course swaps ([10e22bb](https://github.com/uoplan/uoplan/commit/10e22bbd1d54acaa099095440153c9276e72cd4d))
* resolve various bugs on mobile ([d946fab](https://github.com/uoplan/uoplan/commit/d946fab0935f35fddd8679c357a5991fac7c21f9))
* stuff ([30455e6](https://github.com/uoplan/uoplan/commit/30455e6e67933f1ef22ca3e15d5434d4bedea851))
* use correct tag for cli release ([cbe7bed](https://github.com/uoplan/uoplan/commit/cbe7bed5e576b0b7790abe97f42056085c002738))

## [1.0.0-beta.21](https://github.com/uoplan/uoplan/compare/uoplan-monorepo-v1.0.0-beta.20...uoplan-monorepo-v1.0.0-beta.21) (2026-05-25)


### Features

* add tooltip to see full requirement text ([148378c](https://github.com/uoplan/uoplan/commit/148378c473b644a4f785cff9a311731b0bd2207c))
* compress state ([258f18a](https://github.com/uoplan/uoplan/commit/258f18abcf5e82b9cbfa1d2ad4b7fabcff0fce78))
* improve theming ([2525b82](https://github.com/uoplan/uoplan/commit/2525b82e5ebd0282ffe5a67aad943536eb8046d9))
* make encode state smaller ([c08f2ec](https://github.com/uoplan/uoplan/commit/c08f2ec2542d79694456ea0e2f3ffa3d9128a0c8))
* **schedule:** allow french and english to satisfy pre-reqs interchangably ([692fed0](https://github.com/uoplan/uoplan/commit/692fed062b473a61397b2175154f4e1c43606425))


### Bug Fixes

* center copy button on cli modal ([095fa7c](https://github.com/uoplan/uoplan/commit/095fa7c9818a04d7517e5cc82c703111c55acbfc))
* resolve failing test ([135b4ff](https://github.com/uoplan/uoplan/commit/135b4ff13cae68f40eee8eeb06c39bad70da7209))
* **scheduler:** raise limits for some course generation ([88a0015](https://github.com/uoplan/uoplan/commit/88a001576a6c49adde749ff2338c0cc76f15ca23))

## [1.0.0-beta.20](https://github.com/uoplan/uoplan/compare/uoplan-monorepo-v1.0.0-beta.19...uoplan-monorepo-v1.0.0-beta.20) (2026-05-23)


### Features

* add current schedules to the explore page ([3770511](https://github.com/uoplan/uoplan/commit/3770511e40f48c8969f40b765e1ac19b82afb36b))


### Bug Fixes

* **cli:** resolve various bugs with term persistence ([5280022](https://github.com/uoplan/uoplan/commit/5280022a5d4aeb0276b614574f775a628be17bb7))

## [1.0.0-beta.19](https://github.com/uoplan/uoplan/compare/uoplan-monorepo-v1.0.0-beta.18...uoplan-monorepo-v1.0.0-beta.19) (2026-05-23)


### Features

* add uenroll import ([e86ac1c](https://github.com/uoplan/uoplan/commit/e86ac1c7f38b26ea9ed0bb4edaa2bd13434e7ca0))
* **cli:** improve ux experience for cli ([8f92429](https://github.com/uoplan/uoplan/commit/8f9242910924a8acb52dbc89c38a7c998426bc93))
* improve document titles ([69bb675](https://github.com/uoplan/uoplan/commit/69bb675e6ad71b3cecc9fe66ea2c5b9d2364f810))
* improve mobile ux ([13c3cb5](https://github.com/uoplan/uoplan/commit/13c3cb5494c2845a08ce3f56055ca1ef73b97b5f))
* move modal into calendar sidebar ([7e1addb](https://github.com/uoplan/uoplan/commit/7e1addb8b322d88bf76668965e788054586d5ddb))


### Bug Fixes

* allow sorting without filtering on explore, allow pill content to overflow ([0a3a7a0](https://github.com/uoplan/uoplan/commit/0a3a7a06374c63f9f6558428f9b8873704c9be05))
* show page instead of search results until user interacts with it ([e1ca1a6](https://github.com/uoplan/uoplan/commit/e1ca1a61016692254e80224b663005aa5402b781))

## [1.0.0-beta.18](https://github.com/uoplan/uoplan/compare/uoplan-monorepo-v1.0.0-beta.17...uoplan-monorepo-v1.0.0-beta.18) (2026-05-21)


### Features

* add animation to explore pills ([838d09a](https://github.com/uoplan/uoplan/commit/838d09ad9837c82cb89ca4497eab4afbd4392d57))
* add nice week preview to calendar ([b9ae67a](https://github.com/uoplan/uoplan/commit/b9ae67ad747ce400f685ab69751d3ab81c0c9644))
* clean up the sidebar ([8224bbc](https://github.com/uoplan/uoplan/commit/8224bbc9187eb07a3726b950ef840daf14338c22))
* improve explore page persistence ([a85d497](https://github.com/uoplan/uoplan/commit/a85d497273d54b66b24a3419969bb766497ce9c2))
* make the mobile bottom drawer draggable ([d91acc1](https://github.com/uoplan/uoplan/commit/d91acc1fba95eeb27d86548d742e0d91c7dd7150))
* remove footer from calendar page ([7f7ffaf](https://github.com/uoplan/uoplan/commit/7f7ffafea2274ce5e3cece2fc11573e71f495582))
* simplify scheduler flow ([f11fa81](https://github.com/uoplan/uoplan/commit/f11fa8122d2356260bce4b559e3b5fabcd1ba7fc))


### Bug Fixes

* disable dragging drawers on mobile ([04f6f66](https://github.com/uoplan/uoplan/commit/04f6f6665e33afa6719762cfc9f2d16f37aaad16))
* **release-please:** move pr title rename to workflow ([c077664](https://github.com/uoplan/uoplan/commit/c077664dc4a511eec1cc07d7f0fe1c8aa4ff78e0))

## [1.0.0-beta.17](https://github.com/uoplan/uoplan/compare/uoplan-monorepo-v1.0.0-beta.16...uoplan-monorepo-v1.0.0-beta.17) (2026-05-20)


### Features

* add filters to explore page ([96e0c6c](https://github.com/uoplan/uoplan/commit/96e0c6c5e95c96e859f5f56f29fe4037aa71331e))
* add uoplan cli base ([7d16520](https://github.com/uoplan/uoplan/commit/7d165209cb8a3dd1e97eac9d7bf0219af13f33d6))
* add uoplan run command ([a921b4a](https://github.com/uoplan/uoplan/commit/a921b4aca2f64999c385afcf795bd70b46f4080d))
* allow dragging bottom drawer on mobile ([ba1b731](https://github.com/uoplan/uoplan/commit/ba1b7313f6043e84dab53a9b1617b801003f274d))
* clean up sidebar for calendars ([04acba7](https://github.com/uoplan/uoplan/commit/04acba7d77d84885ac35a8d92b3deabceb748d7c))
* **cli-rs:** rust rewrite with cross-platform release pipeline ([f4eb932](https://github.com/uoplan/uoplan/commit/f4eb93242ca4c67f73a233a63306dac3bab12f43))
* **cli:** add course enrolment and deletion with cart ([b1766ee](https://github.com/uoplan/uoplan/commit/b1766eebc8cdce94007ddfb95ad6e07e37206d08))
* **cli:** add course search and cart addition flow ([2ff49c5](https://github.com/uoplan/uoplan/commit/2ff49c5bd67dbbf00246889df4e954657bb6939a))
* **cli:** add firefox support ([0fd3b63](https://github.com/uoplan/uoplan/commit/0fd3b6372c45fde872d280b2a61c74c894484a85))
* **cli:** add publish script ([b7fea4e](https://github.com/uoplan/uoplan/commit/b7fea4e38ba6997344c8f9badbfc57ef83d38c7d))
* **cli:** add run subcommand ([37e9c0e](https://github.com/uoplan/uoplan/commit/37e9c0e093923df4a18280ade6c52fe27f745811))
* **cli:** add term selector ([7c0c830](https://github.com/uoplan/uoplan/commit/7c0c830ec598210156882bd6dcf5222efe0cea82))
* **cli:** add timing to cli run subcommand ([11b9806](https://github.com/uoplan/uoplan/commit/11b980668a747b071f4d467f770cb77c2e8694c6))
* **cli:** add update cache and version check logic ([484e0ed](https://github.com/uoplan/uoplan/commit/484e0ed9b124eb8035781f1a6c9faefaf5ac5be0))
* **cli:** add update subcommand ([7a31b85](https://github.com/uoplan/uoplan/commit/7a31b85e02870a882de1a7163fbaaa2d599e4e05))
* **cli:** make the cli crossplatform ([18f45f1](https://github.com/uoplan/uoplan/commit/18f45f13959b368d6ff3b6e53782805218f6e2c3))
* **cli:** make the cli log in experience better ([5330638](https://github.com/uoplan/uoplan/commit/533063892923575a523a2729379cb470a8941a4f))
* **cli:** match ux of rust port to original typescript ([56c6c70](https://github.com/uoplan/uoplan/commit/56c6c70cbb6b481d9914f84114bbb3bee769e4f2))
* **cli:** persist term selection across logins ([f2d5a56](https://github.com/uoplan/uoplan/commit/f2d5a56601a579ad2cb7a00e976dd31925d71cde))
* **cli:** replace typescript cli with rust implementation ([2dd2195](https://github.com/uoplan/uoplan/commit/2dd2195860b57280424fe4bcd18ba42d3d8dabcb))
* **cli:** wire passive update check and update subcommand ([03c1b5a](https://github.com/uoplan/uoplan/commit/03c1b5af454ead681912f68e0650cf587e13a270))
* **explore:** simplify explore page ([d7d889c](https://github.com/uoplan/uoplan/commit/d7d889c2b5842312f475d5da0fa5c1e7cbb416a9))
* improve explore page display ([61ea370](https://github.com/uoplan/uoplan/commit/61ea370f1e88ab9e8da9a98b54b3c1da9ebd7d58))
* improve layout of calendar sidebars ([59e3806](https://github.com/uoplan/uoplan/commit/59e38061f6829b883e51f8d4f0f29bd24ea7f2d4))
* migrate to oxlint ([e802106](https://github.com/uoplan/uoplan/commit/e802106d3e064cbe684e49aeeb3869b15bf6b0d2))
* **web:** update enrol via cli modal with platform-aware install step ([b084d78](https://github.com/uoplan/uoplan/commit/b084d782a626ec79500acbf0458e9e734b0abbd0))


### Bug Fixes

* **ci:** add bootstrap-sha for release-please ([dd41612](https://github.com/uoplan/uoplan/commit/dd4161265a114f212b1a0c29285972ab309abee2))
* **ci:** add bootstrap-sha for release-please uoplan ([e236533](https://github.com/uoplan/uoplan/commit/e2365336b25de30565c19150d5ee9fadd145c2f9))
* **ci:** add bootstrap-sha for release-please uoplan ([4614375](https://github.com/uoplan/uoplan/commit/4614375ccfc745661603b6a3e2e9e7d3fab6bc0f))
* **cli:** parse icsid properly ([e48186f](https://github.com/uoplan/uoplan/commit/e48186f82e39b8bfb68e52f8b032084c0c3e3406))
* **cli:** pass session properly ([85b3dd4](https://github.com/uoplan/uoplan/commit/85b3dd4a59717887334c43a661a9099a5ca5cc00))
* **cli:** properly reuse term selection ([ae1392a](https://github.com/uoplan/uoplan/commit/ae1392aedbf2718266b5cbbebd4c8eef63968ac2))

## [1.0.0-beta.16](https://github.com/uoplan/uoplan/compare/uoplan-monorepo-v1.0.0-beta.15...uoplan-monorepo-v1.0.0-beta.16) (2026-05-19)


### Features

* add aggregated A+ and pass percentage to profs in explore ([a476db7](https://github.com/uoplan/uoplan/commit/a476db73e83ac0874a17dffac35e6d4f5ac365a5))
* add aggregated A+ and pass percentage to profs in explore ([9abd355](https://github.com/uoplan/uoplan/commit/9abd355b2195ec274b6c3de570e28d1e133bbe0f))
* add better search results for explore ([a8157fc](https://github.com/uoplan/uoplan/commit/a8157fcb6d0e2f3b38028423439576f1378261de))
* add course blacklist generation option ([e8fcce2](https://github.com/uoplan/uoplan/commit/e8fcce2539ba7dfac10af9b5cf2cd1605aca893a))
* add discipline to the search results for explore ([21a0889](https://github.com/uoplan/uoplan/commit/21a0889aea8f3300a0371201728faaaccb6e411c))
* add ics download button on basic calendar ([5973747](https://github.com/uoplan/uoplan/commit/59737477af0c4b3f046457050a2726bfd543b347))
* add warning when out of schedules ([d4cdec3](https://github.com/uoplan/uoplan/commit/d4cdec3dc0f1b6ba5f13885b910df0a5ef452547))
* disable back animation on mobile ([ece7922](https://github.com/uoplan/uoplan/commit/ece79226fccb8c747422ca078ebe1c779798e2a2))
* reduce cls by reserving space for calendar header ([f6fbb21](https://github.com/uoplan/uoplan/commit/f6fbb21a95c467847d163906fa1df6a96a886fc3))
* show start and end dates for whole schedule, and week count ([94785d3](https://github.com/uoplan/uoplan/commit/94785d3e04964ef1f9ab9005721f926df1e6bedf))
* use better wording for week header ([282e939](https://github.com/uoplan/uoplan/commit/282e9396bc81150ce091fe076f7a9fe3f2cb0544))
* use error modal instead of sidebar error card ([96761fb](https://github.com/uoplan/uoplan/commit/96761fb0fd7d1274a89fbb6a8afe103763476e55))


### Bug Fixes

* add top padding to reset modal ([d73744c](https://github.com/uoplan/uoplan/commit/d73744c38a536b227560b394bd3b8cd4cb3022f3))
* deduplicate prof names ([884e246](https://github.com/uoplan/uoplan/commit/884e24641b4fb4d4c3cfe03b122ceb98e9568791))
* disable zooming on mobile ([443c307](https://github.com/uoplan/uoplan/commit/443c3076fd4f77c3dc65687a3366b7a69cb2f012))
* fix bug where generating too quickly causes schedule to get stuck ([b8ace86](https://github.com/uoplan/uoplan/commit/b8ace8623c5df8e26e761c4e91778f6f2828343a))
* jump to busiest week on first generation ([ea51d2e](https://github.com/uoplan/uoplan/commit/ea51d2ec3b95200b414c9f8236eb77c7ec9fe7b6))
* simplify amimation to avoid race condition ([541bbfa](https://github.com/uoplan/uoplan/commit/541bbfa649b95b1799279b9517807bc4e0f16235))
* translate disciplines into french ([918787c](https://github.com/uoplan/uoplan/commit/918787c6c8366838c45190b4295c4fd8e994bc11))
* use correct count for schedule week ([b220b16](https://github.com/uoplan/uoplan/commit/b220b1678f30b864edf361561da37ca88e9e9ffc))

## [1.0.0-beta.15](https://github.com/uoplan/uoplan/compare/uoplan-monorepo-v1.0.0-beta.14...uoplan-monorepo-v1.0.0-beta.15) (2026-05-18)


### Features

* improve calendar layout on mobile ([33c92d6](https://github.com/uoplan/uoplan/commit/33c92d6647359b27d0eb3bf79bc1e6376dc2cdaf))
* improve language switcher ux ([543ea30](https://github.com/uoplan/uoplan/commit/543ea308638172100f94bbdc2706342d43e36723))
* improve page animation ([2ace662](https://github.com/uoplan/uoplan/commit/2ace66280c6cc1cc787a990d108352494b219f59))
* improve ux of explore page back button ([7cbb238](https://github.com/uoplan/uoplan/commit/7cbb2380291dd11b91b3f47be13a240ddd13e450))
* move language switcher to full site ([5577a4c](https://github.com/uoplan/uoplan/commit/5577a4c8400e393bbad4b81d1540f19e3d2fdc07))
* remove tour button ([5a9f56c](https://github.com/uoplan/uoplan/commit/5a9f56c3fe9c47dde0132440c5ae17acaf04f678))
* show all different weeks in a generated schedule ([ede08d0](https://github.com/uoplan/uoplan/commit/ede08d0669a711b161fabb343d285b7eac533e48))
* show the busiest week for the schedule by default ([ecb268c](https://github.com/uoplan/uoplan/commit/ecb268c5d308d1513a7f07efe14613e05a9ec669))
* use consistent page animation ([2617f98](https://github.com/uoplan/uoplan/commit/2617f98ef707f1758bfd98871bfd46a4b325efda))
* use custom calendar implementation to replace fullcalendar ([898af81](https://github.com/uoplan/uoplan/commit/898af81fa691126eaf782891d2997ea623833937))


### Bug Fixes

* do not decrement electives when adding required course on basic calendar ([a1f87f4](https://github.com/uoplan/uoplan/commit/a1f87f449feda91f4b1e918e46c83b0d00bd71f4))
* jump to generated schedule when shared ([2c1316b](https://github.com/uoplan/uoplan/commit/2c1316b810b1789ffbcc6e438d7568322d6eaf91))
* separate date ranges and profs per time slot in courses ([8a4fb4a](https://github.com/uoplan/uoplan/commit/8a4fb4ab60f362015d2912f0b717ee8a8c60937e))

## [1.0.0-beta.14](https://github.com/uoplan/uoplan/compare/uoplan-monorepo-v1.0.0-beta.13...uoplan-monorepo-v1.0.0-beta.14) (2026-05-17)


### Features

* use a cleaner animation for schedule generation ([81cbb40](https://github.com/uoplan/uoplan/commit/81cbb40101062d89d665147257712506d70d9a51))


### Bug Fixes

* **ci:** use correct path for notifications ([2e2a6b7](https://github.com/uoplan/uoplan/commit/2e2a6b71159ade24c51a788e64e1085efebb8637))
* **ci:** use new api url for sending notifications ([9bf2fb4](https://github.com/uoplan/uoplan/commit/9bf2fb4b0514ceeb5a8eb3b5815e7e81cc0e2783))
* generate wrangler types before typecheck ([6f70cd6](https://github.com/uoplan/uoplan/commit/6f70cd6c8037385e712ce25d0e775eaf7d78fbe7))
* use correct env var ([1e9f890](https://github.com/uoplan/uoplan/commit/1e9f890693338ee7dddabf3c3acab316f817ac36))
* use correct vapid env name ([c546bc6](https://github.com/uoplan/uoplan/commit/c546bc6b66ca607e62c9baa138ccf644072ca41a))

## [1.0.0-beta.13](https://github.com/uoplan/uoplan/compare/uoplan-monorepo-v1.0.0-beta.12...uoplan-monorepo-v1.0.0-beta.13) (2026-05-17)


### Features

* add date range for profs in course explorer ([#29](https://github.com/uoplan/uoplan/issues/29)) ([ee635b6](https://github.com/uoplan/uoplan/commit/ee635b67cc25df96037dde1401e446caa8e30189))
* group courses in professor page ([#28](https://github.com/uoplan/uoplan/issues/28)) ([d10de6b](https://github.com/uoplan/uoplan/commit/d10de6b0c62c2874f5c712bc9b52428619c1b7c7))
* improve search bar on explore page ([a9bfd49](https://github.com/uoplan/uoplan/commit/a9bfd49264a70f967ad9e5416031770c4bfbe071))
* make all prof and course codes clickable in explore page ([79ff963](https://github.com/uoplan/uoplan/commit/79ff96312d64f28ec9d03152d31ab54e1e1a5567))
* show neighbours on mobile drawer for graph ([4621107](https://github.com/uoplan/uoplan/commit/46211078eaf89ed4dcf19095923c31f649af8da9))

## [1.0.0-beta.12](https://github.com/uoplan/uoplan/compare/uoplan-monorepo-v1.0.0-beta.11...uoplan-monorepo-v1.0.0-beta.12) (2026-05-17)


### Features

* add footer to all pages ([d924ec5](https://github.com/uoplan/uoplan/commit/d924ec56e6e343c3953f53c3bad343a2b926e4f8))
* add landing page ([b37de6a](https://github.com/uoplan/uoplan/commit/b37de6a267f6d55ca7eab995a177468e9a81472d))
* enhance mobile design for explore components ([#26](https://github.com/uoplan/uoplan/issues/26)) ([bd8576e](https://github.com/uoplan/uoplan/commit/bd8576e31c46dd0d64f23e9d736e8d7a1ed6f6fb))
* use better loading bar ([5068a7b](https://github.com/uoplan/uoplan/commit/5068a7ba54af8fe609db5747a4553663d00804ed))


### Bug Fixes

* use better spacing for grade histogram ([33daeb7](https://github.com/uoplan/uoplan/commit/33daeb77ba724f61b4add08c17cf671183fff871))

## [1.0.0-beta.11](https://github.com/uoplan/uoplan/compare/uoplan-monorepo-v1.0.0-beta.10...uoplan-monorepo-v1.0.0-beta.11) (2026-05-16)


### Features

* use bottom drawer for mobile calendar page ([41fc055](https://github.com/uoplan/uoplan/commit/41fc05528fded7e11bbda17d6e1611d924cbe3d5))


### Bug Fixes

* use correct seed for calendar for buttons ([1055d32](https://github.com/uoplan/uoplan/commit/1055d32c87cf60b8635dcfc6b158ad7c509dd554))
* use router for mode selection ([462746d](https://github.com/uoplan/uoplan/commit/462746dd2e0af427bd8cd27def1376b6de4afeee))

## [1.0.0-beta.10](https://github.com/uoplan/uoplan/compare/uoplan-monorepo-v1.0.0-beta.9...uoplan-monorepo-v1.0.0-beta.10) (2026-05-16)


### Features

* add animation for changelog page ([c57ce33](https://github.com/uoplan/uoplan/commit/c57ce339e3bf55a88428654b2c447fe9267f895c))
* keep term list in sync with live public class search ([0c617a8](https://github.com/uoplan/uoplan/commit/0c617a899727050249a18df9c95b7c2827d2e6fd))


### Bug Fixes

* do not replace history for navigation ([8bb1acb](https://github.com/uoplan/uoplan/commit/8bb1acb08f87f5831aa14928c0eaee32414236b7))

## [1.0.0-beta.9](https://github.com/uoplan/uoplan/compare/uoplan-monorepo-v1.0.0-beta.8...uoplan-monorepo-v1.0.0-beta.9) (2026-05-16)

### Features

- add some quality of life improvements ([836121d](https://github.com/uoplan/uoplan/commit/836121df94f6452b23171ee1d3a9422c5813b1a6))
- allow unlocking locked courses in schedule generation ([d643359](https://github.com/uoplan/uoplan/commit/d643359c93649ba4f99e5936427217f100a96c85))
- improve search results ux for explore page ([f383c48](https://github.com/uoplan/uoplan/commit/f383c4806f5851b145b506981441003781545d9c))
- improve ux of basic calendar page ([63f4a60](https://github.com/uoplan/uoplan/commit/63f4a6043e92ab6c5cf96cfeb9a731728dec15d5))
- **lefthook:** add typecheck to pre-commit ([bc82153](https://github.com/uoplan/uoplan/commit/bc8215340cfc1273ccb6036fb5ef5d275cdccb1b))

## [1.0.0-beta.8](https://github.com/uoplan/uoplan/compare/uoplan-monorepo-v1.0.0-beta.7...uoplan-monorepo-v1.0.0-beta.8) (2026-05-16)

### Features

- add changelog to website ([eb0f14b](https://github.com/uoplan/uoplan/commit/eb0f14b9db447257f66b7f17fd8786e918285b0d))
- add experimental graph visualization ([7b45708](https://github.com/uoplan/uoplan/commit/7b457087b9a3cf9b2d8220787519ab119ab913ea))
- add explore page ([df342c1](https://github.com/uoplan/uoplan/commit/df342c1137f9fd8cb1b91aaa622019a090a232d4))
- add graduate programs ([b9edc0f](https://github.com/uoplan/uoplan/commit/b9edc0f055c54ed4e56f53c858f6a961e0b58709))
- add oxfmt for formatting ([bb5457b](https://github.com/uoplan/uoplan/commit/bb5457b284335347b4617107e98be151fa49317c))
- add router to keep pages separate ([9d2ca45](https://github.com/uoplan/uoplan/commit/9d2ca459d3cbc34a595f0a2990977e7071729db1))
- improve footer ([3001138](https://github.com/uoplan/uoplan/commit/30011388ee9e25d5e8141b8c38f5c51c36c6167a))
- improve graph on mobile and desktop ([178527b](https://github.com/uoplan/uoplan/commit/178527b1c7a901d681157cece96be95edc7a0227))
- improve layout of explore page ([874aad4](https://github.com/uoplan/uoplan/commit/874aad457e6ab0f44bbf3988a4ae73148a03c633))
- improve layout of sidebar on graph page ([e656018](https://github.com/uoplan/uoplan/commit/e65601895397b64c1924727d4a15ac92f2fa088e))
- make option selection more intuitive ([09481d3](https://github.com/uoplan/uoplan/commit/09481d38d2eed6ff4b346026189dd865fdae9117))
- use the next upcoming term as the default ([f552f5a](https://github.com/uoplan/uoplan/commit/f552f5ac5facb170cfe590306fbb00a0a6c8f9c7))

### Bug Fixes

- do not redirect to /step/term unconditionally ([8d1742d](https://github.com/uoplan/uoplan/commit/8d1742d428c6571aa45e1d92797251ef8c44eadb))
- prefer start year for course information ([2bc9c56](https://github.com/uoplan/uoplan/commit/2bc9c56e4f27d2ca641e097e724b45f763939930))

## [1.0.0-beta.7](https://github.com/uoplan/uoplan/compare/uoplan-monorepo-v1.0.0-beta.6...uoplan-monorepo-v1.0.0-beta.7) (2026-05-15)

### Features

- add support for french immersion streams ([332bc45](https://github.com/uoplan/uoplan/commit/332bc45927baa48cf3af47bb29294bfececc2719))
- make easy course generation option more aggressive ([1e4562a](https://github.com/uoplan/uoplan/commit/1e4562aa73b8dc839003728d52c5cccadf51849c))

### Bug Fixes

- **calendar:** use a gray bar when the grade distribution is unknown ([4ca3427](https://github.com/uoplan/uoplan/commit/4ca34273e74226bf4764e3dd81fc6f4b55ae6429))
- **calendar:** use better styling for event animations ([6f44a8f](https://github.com/uoplan/uoplan/commit/6f44a8fd2c088d92263dc6b033c2f6e7e0a1aceb))

## [1.0.0-beta.6](https://github.com/uoplan/uoplan/compare/uoplan-monorepo-v1.0.0-beta.5...uoplan-monorepo-v1.0.0-beta.6) (2026-05-04)

### Features

- add course selection lock in swap modal ([ef66f28](https://github.com/uoplan/uoplan/commit/ef66f281f927630f00f99517b05aac1cce9e5c5b))
- improve design of calendar events ([0d18f46](https://github.com/uoplan/uoplan/commit/0d18f46c8e16ea05d26fc7e7b52613cb8a43a5b3))
- improve layout of calendar events on mobile ([268ba18](https://github.com/uoplan/uoplan/commit/268ba18e58abb0310e4f8fa2ab48455d0a7428f4))

### Bug Fixes

- **ci:** use correct import path for dataPaths ([fa8a2b6](https://github.com/uoplan/uoplan/commit/fa8a2b69c43de838e5cc3bfffd06d501fe680b41))
- **scraper:** enrich schedules with grades on daily scrape ([422b3bc](https://github.com/uoplan/uoplan/commit/422b3bcca2f3417fe70fd4a6a975d7016d83db01))

## [1.0.0-beta.5](https://github.com/uoplan/uoplan/compare/uoplan-monorepo-v1.0.0-beta.4...uoplan-monorepo-v1.0.0-beta.5) (2026-05-01)

### Features

- add course disciplines in dropdown constraints ([7d65718](https://github.com/uoplan/uoplan/commit/7d65718aa5e29e3d13a1041f05c7ba38017cb35d))
- add generation option to prefer easy courses ([36394f4](https://github.com/uoplan/uoplan/commit/36394f49f29e837a84585414575b13c383b609ef))
- add grade breakdown visualizations ([631cbba](https://github.com/uoplan/uoplan/commit/631cbba6a286d096c80c4cce3884227fbc2404c3))
- **grades:** add some grade data ([fc67e93](https://github.com/uoplan/uoplan/commit/fc67e93e28bc8a6311d0ef563b486620863fa741))
- make time and graph visible on calendar event on mobile ([11e6b45](https://github.com/uoplan/uoplan/commit/11e6b45fe7a68967a00416f974bc3e2ba68b6898))
- ship static content as protobuf instead of json ([47e54de](https://github.com/uoplan/uoplan/commit/47e54de1d9aa506acb6b70a372c52009203f5e7e))

### Bug Fixes

- handle 5-digit course codes properly ([4a9f881](https://github.com/uoplan/uoplan/commit/4a9f8812e168c0cefbf1523bb2a2f749da55ce0c))
- include course title in dropdown filter ([bd6fef3](https://github.com/uoplan/uoplan/commit/bd6fef3a09082c3a5ddc3abee4981f6fc8a840ad))
- **scraper:** parse titles for schedules more accurately ([f600ed2](https://github.com/uoplan/uoplan/commit/f600ed282b2ba3763b86c12bd43bed9af09c0284))
- **ux:** support multiple course groups, make generation work with groups ([4462dc1](https://github.com/uoplan/uoplan/commit/4462dc129437b72c06e05c376bd361689095a3f3))

## [1.0.0-beta.4](https://github.com/matteopolak/uoplan/compare/uoplan-monorepo-v1.0.0-beta.3...uoplan-monorepo-v1.0.0-beta.4) (2026-04-30)

### Features

- add loader to notification toggle ([603db7e](https://github.com/matteopolak/uoplan/commit/603db7ebffd0d46f71813c7860e6857da6f78576))
- add notifications for new terms ([2032973](https://github.com/matteopolak/uoplan/commit/2032973d5cbddc5899b126b8ed5c2153269bd9cd))
- add turnstile for notifications ([4489ccf](https://github.com/matteopolak/uoplan/commit/4489ccf7ac3417c72b7a872831199098665a6484))
- improve notification wording ([69e0c05](https://github.com/matteopolak/uoplan/commit/69e0c053d1cde9317a1859bf5702d09664711a87))
- make it a pwa ([87f284d](https://github.com/matteopolak/uoplan/commit/87f284d62a9c61a5ccd1514e42b13da43f9412b4))

### Bug Fixes

- **ci:** separate term state properly ([a9770be](https://github.com/matteopolak/uoplan/commit/a9770be7d5f843587b8cae438ab9bb2f808facd7))
- **ci:** update scrape run id in current step ([301683b](https://github.com/matteopolak/uoplan/commit/301683b0c803e42ae78c28737bc269e1ded003d8))
- **ci:** use silent pnpm for proper output parsing ([d3fce54](https://github.com/matteopolak/uoplan/commit/d3fce545e47f0c28ba9d87ebf9089c74749490cf))
- **ci:** use terms to determine current schedule year, not calendar year ([44aa91f](https://github.com/matteopolak/uoplan/commit/44aa91fcf19579dc165a723f23e019a8a3698964))
- show notification warning when it isnt supported on the browser ([235b93e](https://github.com/matteopolak/uoplan/commit/235b93e3112300403db625c025ed52faebc4a8d3))
- use fetch instead of web-push in worker ([f668e51](https://github.com/matteopolak/uoplan/commit/f668e5143b6b4e2bb26efbc7d799f96dd987a214))
- use public instead of $public ([f4b2cb4](https://github.com/matteopolak/uoplan/commit/f4b2cb47500320266bda26e3debbb2f2d44c6de5))

## [1.0.0-beta.3](https://github.com/matteopolak/uoplan/compare/uoplan-monorepo-v1.0.0-beta.2...uoplan-monorepo-v1.0.0-beta.3) (2026-04-27)

### Features

- **seo:** improve seo for some keywords ([9dba13a](https://github.com/matteopolak/uoplan/commit/9dba13a90f57e2c7f466ba9e1487dfdc57ae4368))

### Bug Fixes

- calendar animation, duplicate courses in basic mode ([45ea698](https://github.com/matteopolak/uoplan/commit/45ea6988012636582b447ac87d7731d51bf9fc57))
- use the same defaults everywhere ([e29ab0f](https://github.com/matteopolak/uoplan/commit/e29ab0f14e38b39f7275223c65236ffe01670b5a))

## [1.0.0-beta.2](https://github.com/matteopolak/uoplan/compare/uoplan-monorepo-v1.0.0-beta.1...uoplan-monorepo-v1.0.0-beta.2) (2026-04-23)

### Features

- improve sharing completed schedules ([46c9053](https://github.com/matteopolak/uoplan/commit/46c90533ca3c3f236e58612a22b91f2b7cf98813))

### Bug Fixes

- move user to correct screen in shared state ([a2342dd](https://github.com/matteopolak/uoplan/commit/a2342ddcbe0a428f334a910a295fa835d9ceb995))
- support more prerequisite formats ([3f7b3f1](https://github.com/matteopolak/uoplan/commit/3f7b3f13a15bac2448b716366f92971445c3d235))

## [1.0.0-beta.1](https://github.com/matteopolak/uoplan/compare/uoplan-monorepo-v1.0.0-beta.0...uoplan-monorepo-v1.0.0-beta.1) (2026-04-11)

### Features

- add animation for language switch ([451d7a1](https://github.com/matteopolak/uoplan/commit/451d7a112e4db287ba5cff5edfd36af38bae0cfa))
- add badges to mode selection ([70d7af8](https://github.com/matteopolak/uoplan/commit/70d7af84d3028113ba87b96d937fadf9f3b12a33))
- add basic mode ([03ddf4c](https://github.com/matteopolak/uoplan/commit/03ddf4c12b507cb5d74432f42902154ed355b38b))
- add beta badge ([679ab4d](https://github.com/matteopolak/uoplan/commit/679ab4dc5a7af4eae66dc423d53cee00fa43dcb5))
- add better generation errors ([a9e629e](https://github.com/matteopolak/uoplan/commit/a9e629ec1ee8f8d33d75271b8d1f708b62a93476))
- add branch to version ([2c97efa](https://github.com/matteopolak/uoplan/commit/2c97efab6cfa65cadc60851be7dfce76d180d300))
- add build version, github link ([194de7b](https://github.com/matteopolak/uoplan/commit/194de7b3345a551a3de5bdcc7667786af2a4a212))
- add driverjs tutorial ([e465e8c](https://github.com/matteopolak/uoplan/commit/e465e8c3f0e55effd9b81b9730996ad8e557fcc2))
- add elective filter to basic mode ([b00e322](https://github.com/matteopolak/uoplan/commit/b00e322cbd99d2a0922d6ad35948a232b9d8aae4))
- add eslint ([56defc0](https://github.com/matteopolak/uoplan/commit/56defc0d15a9d465f85bb32a0cad711c8a0843b0))
- add favicon ([6cb555b](https://github.com/matteopolak/uoplan/commit/6cb555b1c9a406c1ab88816c28cbeb1a5a59540c))
- add feedback email ([63e95c6](https://github.com/matteopolak/uoplan/commit/63e95c6c32d11639dd68e40a38646ced9fae1876))
- add filter for course component status ([ee2e1d4](https://github.com/matteopolak/uoplan/commit/ee2e1d4f0551b7f2acb939e02855a844ec8857f7))
- add filter for virtual courses ([25ee366](https://github.com/matteopolak/uoplan/commit/25ee36654df38e672099d9fe22c8023e77f042ad))
- add french language support ([299c887](https://github.com/matteopolak/uoplan/commit/299c8877667ea1aeb98809216e0612dc56827339))
- add generation option to limit breaks and limit number of 1000-level courses in total ([7bc44fb](https://github.com/matteopolak/uoplan/commit/7bc44fbf60c8e8c054abb7e292de144b261b8583))
- add ical download ([5498fee](https://github.com/matteopolak/uoplan/commit/5498fee4e20f34745ef3ed55c42f54e8fe108015))
- add knip ([4497da5](https://github.com/matteopolak/uoplan/commit/4497da54012832fb3af21a3ab73d29c3b5e97e0d))
- add mobile support ([ad5e256](https://github.com/matteopolak/uoplan/commit/ad5e256968ed64a930d77dd879344fa28d164f91))
- add more generation options ([a76baf9](https://github.com/matteopolak/uoplan/commit/a76baf9065e5ffe80da7a84718d4733ed35c17dd))
- add ratemyprof links ([8dd5551](https://github.com/matteopolak/uoplan/commit/8dd55514b1874d2197c8cfcf9984d06c28f7991a))
- add ratemyprof ratings ([14b2d0a](https://github.com/matteopolak/uoplan/commit/14b2d0aba31a1d18b277a3337fcd33afe448627d))
- add ratemyprofessors rating tooltip ([809d6a9](https://github.com/matteopolak/uoplan/commit/809d6a9692432a159515f95375dffe51a2785060))
- add schedule generation animation ([e04450d](https://github.com/matteopolak/uoplan/commit/e04450ddfecdde881252060390bf43e6f24b70ed))
- add shareable codes ([a6bc8db](https://github.com/matteopolak/uoplan/commit/a6bc8db6ecbf950b66dfe0bae3d464c8f5a126b6))
- add smart auto assigning of courses ([4ca040d](https://github.com/matteopolak/uoplan/commit/4ca040d8b35e99bec5001d73bbec770bd92346f5))
- add support for aliases ([4278e9c](https://github.com/matteopolak/uoplan/commit/4278e9c2c2d4c9d9e96d8bb496dd1e9b9ec992df))
- add support for minors ([1e7c592](https://github.com/matteopolak/uoplan/commit/1e7c592cb304a8e45fdece37d9b479cbcc3f276b))
- add time display to schedule course blocks ([#4](https://github.com/matteopolak/uoplan/issues/4)) ([3ffb559](https://github.com/matteopolak/uoplan/commit/3ffb559514132f89f742fcd18869769abb2a42af))
- add virtual class support ([c7c79c3](https://github.com/matteopolak/uoplan/commit/c7c79c32c8d3ef660c93f00b82960a22705ac90e))
- add virtual course filtering ([f15fb4b](https://github.com/matteopolak/uoplan/commit/f15fb4b353a1fb167b79612ddbd19ad0c90cacda))
- allow over-subscribing course selections ([3d93eef](https://github.com/matteopolak/uoplan/commit/3d93eef9fff0a80255c73708dd5cfdd5a3020759))
- auto-assign requirements more often ([518d460](https://github.com/matteopolak/uoplan/commit/518d460d48f002769d397a1ef03a9067b9792692))
- better filtering ([b76fb3e](https://github.com/matteopolak/uoplan/commit/b76fb3eceba5391750f61e88c9ef85d576c0bb7a))
- better generation behaviour for some scenarios ([09f859e](https://github.com/matteopolak/uoplan/commit/09f859e7eec92140b6e96b24fcb4cd41e1c9356d))
- better req ([74ff737](https://github.com/matteopolak/uoplan/commit/74ff737ce880d86c109fa1048e4a256f731a6d89))
- better ui, requirements parsing, workflow ([dd7012b](https://github.com/matteopolak/uoplan/commit/dd7012bbb97f00ecb0ffc5cb9aa1df4bd81132f7))
- better ux for forcing options selections ([0e49e19](https://github.com/matteopolak/uoplan/commit/0e49e19b8d787b583aba8c57e6a59f8fa24bddd5))
- **ci:** always amend commits to reduce commit noise ([7ecd73e](https://github.com/matteopolak/uoplan/commit/7ecd73eb1918b2dbac1eaf9cc1ced89d1da3e3de))
- clear up wording for transcript upload ([2dce470](https://github.com/matteopolak/uoplan/commit/2dce4700f3459e501be1caba6c68c3095dfc70da))
- disable generation button when there are no more schedules ([ded385c](https://github.com/matteopolak/uoplan/commit/ded385cfb64949c83c25f5be217af144cb62d5d7))
- do not select courses with no times ([008e0f0](https://github.com/matteopolak/uoplan/commit/008e0f06b81b9dcfb4fc83959f88213fd14e032c))
- filter non-degree courses from transcript parsing ([#5](https://github.com/matteopolak/uoplan/issues/5)) ([e4c9410](https://github.com/matteopolak/uoplan/commit/e4c9410164b52925cbe3f669b2acde6242788336))
- hide requirements when they have no courses available ([c0b7807](https://github.com/matteopolak/uoplan/commit/c0b7807d8128353be6bce574f9f8cf35ac63a982))
- hide weekends on mobile if no courses on weekend ([54715ac](https://github.com/matteopolak/uoplan/commit/54715ac1ce1b69000f0a39ad4da0fc49c8efe273))
- improve calendar style ([b61d221](https://github.com/matteopolak/uoplan/commit/b61d2218f883200128773ced99ea2b0987155ec3))
- improve calendar styling ([9e60b42](https://github.com/matteopolak/uoplan/commit/9e60b4231e0c274526331a3490430d7f73536657))
- improve calendar styling ([edc0b33](https://github.com/matteopolak/uoplan/commit/edc0b33728f97f5d4cc940ac7ac1ec5b7193d10f))
- improve diff, program req parsing ([0c6d756](https://github.com/matteopolak/uoplan/commit/0c6d756e699d50e36e8ab2aca56ea61f7616a5f1))
- improve eligible courses error message ([50b8007](https://github.com/matteopolak/uoplan/commit/50b80072cb6ab41d488cdeec76efb76edb8f1c4a))
- improve filtering ([a4f870e](https://github.com/matteopolak/uoplan/commit/a4f870e74bfcffafdc86a2226df1732a025e1e66))
- improve generation ([806e233](https://github.com/matteopolak/uoplan/commit/806e233ed68b4d4a06fd2bf06f53acf2b716017b))
- improve generation constraints ([771a0cc](https://github.com/matteopolak/uoplan/commit/771a0cc9588b678b143f87eb62dfb69a2af36028))
- improve generation error message ([84a649c](https://github.com/matteopolak/uoplan/commit/84a649c4a5cea53112f14a626ff2f349f5b714eb))
- improve generation more ([92c19ae](https://github.com/matteopolak/uoplan/commit/92c19ae2bc9a92ca9692cbe8dead8e2f05f9b976))
- improve option selection ux ([0fa8054](https://github.com/matteopolak/uoplan/commit/0fa8054167e82f59473f632dfbb434b25faffcfd))
- improve performance ([a611015](https://github.com/matteopolak/uoplan/commit/a61101582b4ad7ce1c1b6ce1a967c841ad596569))
- improve req ([4094ebb](https://github.com/matteopolak/uoplan/commit/4094ebbad1eb57984df3286224003e7c4357315c))
- improve requirements parsing, work on better generation ([4c55ccd](https://github.com/matteopolak/uoplan/commit/4c55ccde2581f951cdf2f9c864b18b38de8731f9))
- improve schedule generation ([dfb0700](https://github.com/matteopolak/uoplan/commit/dfb070018e8ce7d92712e29bf2352dad121ac32e))
- improve seo ([726a6e3](https://github.com/matteopolak/uoplan/commit/726a6e38dc62217e0c30921e85c641470bd8c130))
- improve state encode/decode ([7ac2094](https://github.com/matteopolak/uoplan/commit/7ac20947b2bb28bc95ebfa72f02c701c8726c40c))
- improve step ux ([d782a31](https://github.com/matteopolak/uoplan/commit/d782a31d3d8d4c6df945e0e30acaebb1284229ef))
- improve ux ([bfb00bd](https://github.com/matteopolak/uoplan/commit/bfb00bd571d0f6110af58d167b285a31e7069c8c))
- improve ux ([e2866d2](https://github.com/matteopolak/uoplan/commit/e2866d2b77c4dad18ffc5b025fa9dfe9b6add0c1))
- improve ux for basic mode ([28dc81d](https://github.com/matteopolak/uoplan/commit/28dc81d2dc7c9cb54553243427ac6c45171de86c))
- increase max courses in basic mode ([9d69947](https://github.com/matteopolak/uoplan/commit/9d69947cee1d21dc95812ba01331dce0b27e2c27))
- keep schedules when changing basic settings and append new ones ([1bf43f3](https://github.com/matteopolak/uoplan/commit/1bf43f3412c0da0c4effb85ea0c37d55733f9fc7))
- make generation more diverse when lots of options are available ([59ca77b](https://github.com/matteopolak/uoplan/commit/59ca77bedc1896d387ec1315785c14bc2ae0e9f2))
- make generation more efficient ([2d59ac1](https://github.com/matteopolak/uoplan/commit/2d59ac1980e877e327a581af5f26b068ec963ec8))
- parse and automatically select minor from transcript ([2a143f4](https://github.com/matteopolak/uoplan/commit/2a143f4b45889674c13aa9369b15336feb386556))
- parse minor from transcript ([33b7fcb](https://github.com/matteopolak/uoplan/commit/33b7fcb9beb952009d326e9f800f033648bae563))
- performance improvements ([d1227c3](https://github.com/matteopolak/uoplan/commit/d1227c374e88c01f4a23af4d828495a893eb11ff))
- persist step status ([0033e71](https://github.com/matteopolak/uoplan/commit/0033e71a8348522e242753f598562bc7254e9394))
- qol for swapping courses ([1e26ef6](https://github.com/matteopolak/uoplan/commit/1e26ef6a54886624d7445465f66ffad4595a305a))
- **qol:** select parent options when child option is selected ([9d2eaed](https://github.com/matteopolak/uoplan/commit/9d2eaed236854d46369c32e746f31c9a835ffe7b))
- reduce nesting in requirements ([9ee7096](https://github.com/matteopolak/uoplan/commit/9ee70966da2f6b07c581ccd59d5279196445dbce))
- refactor for perf and readability ([8d47ff2](https://github.com/matteopolak/uoplan/commit/8d47ff218c56ff55ba26fe4fdd037ee151a48d27))
- refactor generation and requirements ([121f619](https://github.com/matteopolak/uoplan/commit/121f619f6690b8b9eb82264b2db9d9c6e7a43802))
- **release:** configure prerelease mode for beta releases ([00330b2](https://github.com/matteopolak/uoplan/commit/00330b22c127b5f47b7edac2898594456ce714df))
- rename website ([8809187](https://github.com/matteopolak/uoplan/commit/880918710d1cd8342faa07aa30a68b51219bb5f7))
- reset stored state if it's using the old protocol ([019a8f7](https://github.com/matteopolak/uoplan/commit/019a8f71ea8f49c5b5eb4654ffc475fd0cc6f1e6))
- scrape course and program catalogue for all previous years ([9eafb0f](https://github.com/matteopolak/uoplan/commit/9eafb0ff55784f5562f4e56f2d96899bae6606a2))
- seeded rng, better generation for new students ([d416940](https://github.com/matteopolak/uoplan/commit/d41694054452a6dd51ad6ae6af6e089128c32e10))
- share button tooltip ([#7](https://github.com/matteopolak/uoplan/issues/7)) ([b4a05d9](https://github.com/matteopolak/uoplan/commit/b4a05d9285111726d3320901144765a38a2e9d3c))
- simplify schedule generation ([7d7d4e7](https://github.com/matteopolak/uoplan/commit/7d7d4e759159554566e7ffc6cf2af07f7ff65a95))
- split requirements step into two ([54fd543](https://github.com/matteopolak/uoplan/commit/54fd54343c43825f3010cde32493735eb027c447))
- split up course filters on basic and advanced ([5addf7e](https://github.com/matteopolak/uoplan/commit/5addf7ef0c6e77d6bf808f39d748ff7ae4b00be8))
- split up option selection ([04c2ac9](https://github.com/matteopolak/uoplan/commit/04c2ac9c3b5946e4d0f34e55892da5d98fddceb8))
- support more pre-requisites ([6d2b97d](https://github.com/matteopolak/uoplan/commit/6d2b97dedfacd2d2d94fa42f2b7b27fe00dc6205))
- support multiple terms ([80322be](https://github.com/matteopolak/uoplan/commit/80322be850c24b294fe5b27bfb0211a05571c4ed))
- support transfer credits as courses ([#3](https://github.com/matteopolak/uoplan/issues/3)) ([6e8561b](https://github.com/matteopolak/uoplan/commit/6e8561b57324045313e3684e8955c8ea48a7a3bc))
- switch to protobuf for state ([f9ebc12](https://github.com/matteopolak/uoplan/commit/f9ebc12671daba64de446884d2915f1126db284a))
- use better ux for mobile calendar view ([6d2d1d6](https://github.com/matteopolak/uoplan/commit/6d2d1d636a661362e5909dacd46b479de1047f28))
- use pools for req ([24d5863](https://github.com/matteopolak/uoplan/commit/24d5863b72dc24f6476e6ee46833026fa906fbbe))

### Bug Fixes

- add max attempts for colour map to avoid hanging on large course amounts ([95e9d7a](https://github.com/matteopolak/uoplan/commit/95e9d7a753e8bca9f37c413059b25cd5fd6718ab))
- add missing translations ([749add7](https://github.com/matteopolak/uoplan/commit/749add7c4788f7b7c32400d46ca6ea10a7c5833b))
- add program, start year to encoded state ([c1ec72c](https://github.com/matteopolak/uoplan/commit/c1ec72c0b9f26b9193f6fb221edf79eb945ac904))
- add timeout to generator and avoid blocking main thread ([6de9501](https://github.com/matteopolak/uoplan/commit/6de9501509198c4b3ef9bffe59b9ed66379ac762))
- adjust default elective options ([4c99b0c](https://github.com/matteopolak/uoplan/commit/4c99b0caba8495b89a7d81966bcd6e50dd68de47))
- align basic mode sidebar with advanced mode ([624317d](https://github.com/matteopolak/uoplan/commit/624317debaef6af2ccad7b8c22d6e2fb4fb7a07e))
- allow honours projects even with no schedule ([2711c6a](https://github.com/matteopolak/uoplan/commit/2711c6a82db2dd9d7d0c949dfe617c8e6b26af4b))
- allow partial pinning of requirements for generation ([117bc64](https://github.com/matteopolak/uoplan/commit/117bc6455e521984ee8db6f23fbe0d28c231c5c4))
- allow removing auto-assigned courses ([8325397](https://github.com/matteopolak/uoplan/commit/83253970d48067864c59e9c52b25a3426936b067))
- avoid page shift when modal is open ([19e0d3a](https://github.com/matteopolak/uoplan/commit/19e0d3a06d41e20c31f585c75a50e76d4890fb7d))
- basic mode generation on fresh profile ([1321d3a](https://github.com/matteopolak/uoplan/commit/1321d3a57c666a33df3c485e2e1a97996cf699ca))
- better english ([1af2a02](https://github.com/matteopolak/uoplan/commit/1af2a027456a8e578d4f1ec98c8937d801f1b962))
- calendar animation fade ([ee89a87](https://github.com/matteopolak/uoplan/commit/ee89a870d92eb49d7de22e664e51e15552bd6fcb))
- calendar sizing ([4ae55d6](https://github.com/matteopolak/uoplan/commit/4ae55d6d86859a2bcd5c643b9bae851e5a4d5fa4))
- **ci:** support yearly catalogues in schedule scraper ([5ef13fc](https://github.com/matteopolak/uoplan/commit/5ef13fc6a3c29e5c1cb312d99ef518ba771f7360))
- **ci:** syntax error ([10563e3](https://github.com/matteopolak/uoplan/commit/10563e32d52a855920074aa575e4011443282ee2))
- course swapping ([004b772](https://github.com/matteopolak/uoplan/commit/004b772f00e548d808ae48fa4a7d8fa1093568ce))
- do not count X900 courses for general pools ([057735f](https://github.com/matteopolak/uoplan/commit/057735fa5c51b44eb3b6f2d005be7d339bded680))
- do not read scrape data from cache ([60846b6](https://github.com/matteopolak/uoplan/commit/60846b672a0acb327cf09f1cc7a6a0aa830453bd))
- dropdown rerender issue, qol ([a502f83](https://github.com/matteopolak/uoplan/commit/a502f833fd3b5ab72452f9151eb4bcf4885034d8))
- elective option dropdown width ([bcb90ba](https://github.com/matteopolak/uoplan/commit/bcb90ba43f2ae891b5336ed8c0fe01503a2446ac))
- hide completed courses from pick more ([17e8409](https://github.com/matteopolak/uoplan/commit/17e8409853b99705a3ebddddfb5aa381859699dc))
- improve parsing pre-requisites ([5983746](https://github.com/matteopolak/uoplan/commit/598374624392b099aa658039f3f08d908c37f850))
- include latest courses in course list ([3def8e7](https://github.com/matteopolak/uoplan/commit/3def8e74c8bc8b69b559b935ae0a0aa913266dbd))
- lints ([e48d9f8](https://github.com/matteopolak/uoplan/commit/e48d9f8a4341056b6fff3efc7f4328c40b0f8203))
- make elective count default 0 ([85c8acc](https://github.com/matteopolak/uoplan/commit/85c8acc70b56d96bbefb53524c3cff84ce535699))
- make elective levels not apply to non-elective courses ([52a1aee](https://github.com/matteopolak/uoplan/commit/52a1aee44ccbdeebc9d83837feeccf083f274415))
- move buttons into own component for perf ([dab2cc1](https://github.com/matteopolak/uoplan/commit/dab2cc15b90d850a3294d6ec5d1a4e3b710ce01e))
- only apply virtual filter to electives ([e7847d3](https://github.com/matteopolak/uoplan/commit/e7847d38113c7df5dab67a54abdb83a1c3b39f72))
- only expand options collapsibles in the path of the error ([9ecfc24](https://github.com/matteopolak/uoplan/commit/9ecfc2491606d61d8154ebb1eb198aeadefec71b))
- only filter out course codes from transcript if they're not in the index ([9a67afb](https://github.com/matteopolak/uoplan/commit/9a67afba3a93249520917f1cc4106208d6660841))
- parse program from transcript with tranferred classes ([#2](https://github.com/matteopolak/uoplan/issues/2)) ([1c66fea](https://github.com/matteopolak/uoplan/commit/1c66fea0e8fcbe8fb5099c0f9bb508dd99150dc5))
- **release-please:** add packages config with root path for proper detection ([5dd1d10](https://github.com/matteopolak/uoplan/commit/5dd1d1073ad7595d719c0acd03e68fe6ebb0dad2))
- **release-please:** lower manifest version to 0.0.0 to trigger initial release catch-up ([d5af51f](https://github.com/matteopolak/uoplan/commit/d5af51fdf1f5b8430a9c7937938aea9d6b2aa0b6))
- **release-please:** rename manifest to .release-please-manifest.json for proper detection ([9e44985](https://github.com/matteopolak/uoplan/commit/9e44985511bc9dd000932fbe3d37506bf417cdfa))
- **release:** correct manifest format and prerelease config structure ([42a663b](https://github.com/matteopolak/uoplan/commit/42a663b6e1a68129c2cf1fa6db867620c76c56cb))
- **release:** use prerelease versioning strategy to increment beta versions sequentially ([1e397b3](https://github.com/matteopolak/uoplan/commit/1e397b3131388049d1531bc2a49889d6ff9891e7))
- remove 5000+-level courses from being electives ([a9b6c85](https://github.com/matteopolak/uoplan/commit/a9b6c85707dee3fb7710818ca10aaf4828719e37))
- remove div from p tag ([5b60e8d](https://github.com/matteopolak/uoplan/commit/5b60e8d653c330fe333f05ed54441374fcaa89dd))
- remove generatedAt field from json so diffing works in ci ([e9566b2](https://github.com/matteopolak/uoplan/commit/e9566b28fddb6dc1328fbc31689fb1b15e6b0cff))
- schedule generation ([6347108](https://github.com/matteopolak/uoplan/commit/634710801f1f2bb31f6e9bd31983efa9111c8964))
- show full error on basic mode ([d1c16b9](https://github.com/matteopolak/uoplan/commit/d1c16b99b119f502805d16c598808eb0e006ee87))
- stable sort all json data ([a162a45](https://github.com/matteopolak/uoplan/commit/a162a458420c7ee944aea4d99e33ac0956c8c057))
- support more complex pre-requisite parsing ([d775740](https://github.com/matteopolak/uoplan/commit/d77574041b26c99d9a4db8be373820af63cbb696))
- **test:** run all tests, move into separate folders ([9c80d2d](https://github.com/matteopolak/uoplan/commit/9c80d2df06e1ca40a7b4390fad962a6817d558f3))
- tests ([a5272fb](https://github.com/matteopolak/uoplan/commit/a5272fb30f105cd3a85d3ac74eef8dc351c7dece))
- **test:** update steps in tests ([5fba133](https://github.com/matteopolak/uoplan/commit/5fba133e6bd8ee4ad5ff89b6556a4fad68baacff))
- **transcript:** add polyfill for readablestream async iterator ([f6bffa3](https://github.com/matteopolak/uoplan/commit/f6bffa3cbafbe2f33f65266758287b0041b9746a))
- type errors ([4f0b57a](https://github.com/matteopolak/uoplan/commit/4f0b57ac393d4c2d271be9a69725d7a492604d23))
- use better program matching ([a281468](https://github.com/matteopolak/uoplan/commit/a28146844f09f7967d7cf1f8701b98a54a341fe8))
- use correct eslint config ([7c4548e](https://github.com/matteopolak/uoplan/commit/7c4548ec7714edccaa7c2c4b555ec4de70dc92b2))
- use correct paths for public data ([093e5ce](https://github.com/matteopolak/uoplan/commit/093e5ce9fee758570aabf81aa33c8d4bc889d159))
- use correct prereq for honours ([9eabb77](https://github.com/matteopolak/uoplan/commit/9eabb777027bd0ff3c7de87702db4913979e0247))
- **web:** prevent basic calendar from auto-generating schedules on load ([b466519](https://github.com/matteopolak/uoplan/commit/b466519f9a1e798b28c1cdd64edad35a469c6b7d))

### Performance Improvements

- **schedule:** improve generation speed via mrV and early branch pruning ([48007a4](https://github.com/matteopolak/uoplan/commit/48007a4e2cf90804d514511dc2c7fd2711640eb2))
