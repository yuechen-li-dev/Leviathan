import React from 'react';
import { createRoot } from 'react-dom/client';
import { MachinaHost } from './machina/MachinaHost';
import './styles.css';

createRoot(document.getElementById('root')!).render(<MachinaHost />);
