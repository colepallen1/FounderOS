import type { Config } from 'tailwindcss';

// Every colour is a CSS token (app/globals.css), switched by data-theme on <html>.
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: token('bg'),
        surface: token('surface'),
        raised: token('raised'),
        line: token('line'),
        ink: token('ink'),
        muted: token('muted'),
        faint: token('faint'),
        accent: token('accent'),
        'accent-hi': token('accent-hi'),
        good: token('good'),
        warn: token('warn'),
        bad: token('bad'),
      },
      fontFamily: {
        display: 'var(--font-display)',
        body: 'var(--font-body)',
        num: 'var(--font-num)',
      },
    },
  },
  plugins: [],
} satisfies Config;
