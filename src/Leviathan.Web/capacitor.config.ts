import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'dev.yuechen.leviathan',
  appName: 'Leviathan',
  webDir: 'dist',
  server: {
    cleartext: true,
  },
};

export default config;
