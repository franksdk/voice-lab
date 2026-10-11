import React from 'react';
import { createRoot } from 'react-dom/client';
import VoiceLab from '../components/voice-lab';
import PhoneLab from '../components/phone-lab';
import '../app/globals.css';
const Page = /^\/voice-lab\/phone\/?$/.test(window.location.pathname) ? PhoneLab : VoiceLab;
createRoot(document.getElementById('root')!).render(<React.StrictMode><Page/></React.StrictMode>);
