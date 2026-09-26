import { mount } from 'svelte';
import { registerSW } from 'virtual:pwa-register';
import './app.css';
import App from './App.svelte';

const app = mount(App, { target: document.getElementById('app')! });

// Offline support (PWA); updates silently in the background.
if (import.meta.env.PROD) registerSW({ immediate: true });

export default app;
