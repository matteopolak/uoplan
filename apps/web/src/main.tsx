import React from 'react';
import ReactDOM from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import { I18nProvider } from '@lingui/react';
import { theme } from './styles/theme';
import './styles/global.css';
import App from './App';
import { i18n, initializeI18n } from './i18n';

await initializeI18n();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nProvider i18n={i18n}>
      <MantineProvider theme={theme} defaultColorScheme="dark">
        <App />
      </MantineProvider>
    </I18nProvider>
  </React.StrictMode>
);
