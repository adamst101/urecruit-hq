/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: ["class"],
    content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
  	extend: {
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		colors: {
  			/* ── uRecruit Premium Dark Tokens (ur.*) ────────────────────────────
  			   Reference: src/lib/theme.js and src/index.css --ur-* variables.
  			   Usage: bg-ur-shell, text-ur-secondary, border-ur-shell-border, etc.
  			   ────────────────────────────────────────────────────────────────── */
  			ur: {
  				/* Surfaces */
  				page:            '#0a0e1a',
  				shell:           '#101A2B',
  				'header-band':   '#0C1524',
  				card:            '#111827',
  				'row-active':    '#162338',
  				expanded:        '#162B47',
  				input:           '#1f2937',
  				/* Borders & Dividers (opaque) */
  				border:          '#1f2937',
  				'border-input':  '#374151',
  				/* Borders & Dividers (rgba — for arbitrary Tailwind usage) */
  				'shell-border':  'rgba(148,163,184,0.20)',
  				'divider-strong':'rgba(148,163,184,0.22)',
  				divider:         'rgba(148,163,184,0.14)',
  				'divider-subtle':'rgba(148,163,184,0.10)',
  				/* Row states */
  				'row-alt':       'rgba(255,255,255,0.015)',
  				'row-hover':     'rgba(255,255,255,0.04)',
  				/* Accent */
  				amber:           '#e8a020',
  				'amber-hover':   '#f3b13f',
  				'amber-rail':    'rgba(232,160,32,0.65)',
  				/* Text */
  				primary:         '#f9fafb',
  				secondary:       '#9ca3af',
  				micro:           'rgba(148,163,184,0.82)',
  				muted:           '#6b7280',
  				interactive:     '#e8a020',
  				/* Status */
  				success:         '#10b981',
  				'success-bg':    '#052e16',
  				error:           '#ef4444',
  				'error-bg':      '#7f1d1d',
  				warning:         '#f59e0b',
  				'warning-bg':    '#92400e',
  			},
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			},
  			sidebar: {
  				DEFAULT: 'hsl(var(--sidebar-background))',
  				foreground: 'hsl(var(--sidebar-foreground))',
  				primary: 'hsl(var(--sidebar-primary))',
  				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  				accent: 'hsl(var(--sidebar-accent))',
  				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
  				border: 'hsl(var(--sidebar-border))',
  				ring: 'hsl(var(--sidebar-ring))'
  			}
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
}