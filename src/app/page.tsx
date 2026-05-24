import Link from 'next/link';
import styles from './page.module.css';

export default function Home() {
  return (
    <main className={styles.main}>
      {/* Premium Background Orbs */}
      <div className={styles.heroBackground}>
        <div className={styles.gradientOrb1} />
        <div className={styles.gradientOrb2} />
      </div>

      {/* Hero Header */}
      <header className={styles.header}>
        <div className={styles.badge}>
          <span className={styles.badgeDot} />
          100% Client-Side Engine
        </div>
        <h1 className={styles.title}>
          SpriteCraft <span className={styles.highlight}>Webtools</span>
        </h1>
        <p className={styles.subtitle}>
          Professional-grade local workspace utilities for game developers and pixel artists.
          <strong> No uploads. No servers. Completely private.</strong>
        </p>
      </header>

      {/* Tools Portal Cards */}
      <section className={styles.toolsSuite}>
        <div className={styles.toolCard}>
          <div className={styles.toolIcon}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="2" y="2" width="20" height="20" rx="2" ry="2" />
              <line x1="7" y1="2" x2="7" y2="22" />
              <line x1="17" y1="2" x2="17" y2="22" />
              <line x1="2" y1="12" x2="22" y2="12" />
            </svg>
          </div>
          <h2 className={styles.toolTitle}>Video to Spritesheet</h2>
          <p className={styles.toolDesc}>
            Load video files (MP4, WebM) or individual images, extract precise frames, 
            remove backgrounds, and compile them into a game-ready spritesheet with JSON metadata.
          </p>
          <ul className={styles.toolFeatures}>
            <li>✦ FPS-controlled custom frame extraction</li>
            <li>✦ AI background & watermark removals</li>
            <li>✦ Sprite outline stroke customizations</li>
            <li>✦ VS Code-style dockable tabs interface</li>
          </ul>
          <Link href="/tools/video-to-spritesheet" className={styles.toolCta}>
            Launch Spritesheet Editor
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </Link>
        </div>

        <div className={styles.toolCard}>
          <div className={`${styles.toolIcon} ${styles.iconPixel}`}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="1" />
              <path d="M7 7h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2zm-8 4h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2zm-8 4h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2z" fill="currentColor"/>
            </svg>
          </div>
          <h2 className={styles.toolTitle}>Sprite Pixelator</h2>
          <p className={styles.toolDesc}>
            Convert packed spritesheets, high-res images, or video clips into retro pixel art. 
            Specify slicing dimensions, apply classic palettes, and dither grids.
          </p>
          <ul className={styles.toolFeatures}>
            <li>✦ Grid-based or dimension-based sprite slicing</li>
            <li>✦ Presets: NES, PICO-8, Commodore 64, GameBoy</li>
            <li>✦ Bayer and Floyd-Steinberg dither models</li>
            <li>✦ Custom pixel layouts (Blocks, Circles, Diamonds)</li>
          </ul>
          <Link href="/tools/pixelator" className={`${styles.toolCta} ${styles.ctaPixel}`}>
            Launch Sprite Pixelator
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </section>

      {/* Hub Features grid */}
      <section className={styles.featuresSection}>
        <h3 className={styles.featuresHeader}>Engine Highlights</h3>
        <div className={styles.featureGrid}>
          <div className={styles.feature}>
            <h4>100% Client-Side</h4>
            <p>Everything processes in your browser thread using GPU-accelerated canvas API and WebCodecs decoders. No files ever touch our servers.</p>
          </div>
          <div className={styles.feature}>
            <h4>Game Engine Compatible</h4>
            <p>Export all outputs in optimized PNG spritesheets together with industry-standard JSON coordinate files compatible with Unity, Godot, Phaser, and Unreal.</p>
          </div>
          <div className={styles.feature}>
            <h4>Advanced Shaders</h4>
            <p>Experience fast and smooth pixel filters, ordered matrices, outline generation, and color modifications processing in milliseconds.</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <p>Built with Next.js • Client-Side WASM & Canvas Decoders • Open Source & Ad-Free</p>
      </footer>
    </main>
  );
}
