import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.eventpro.pos',
  appName: 'EventPro POS',
  webDir: 'dist',
  plugins: {
    SunmiPrinter: {
      bindOnLoad: true, // Auto-bind to Sunmi print service on startup
    }
  },
  android: {
    allowMixedContent: true,
  }
};

export default config;
