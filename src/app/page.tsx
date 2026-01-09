import Link from 'next/link';
import styles from './page.module.css';

export default function Home() {
  return (
    <main className={styles.main}>
      {/* Hero Section */}
      <section className={styles.hero}>
        <div className={styles.heroBackground}>
          <div className={styles.gradientOrb1} />
          <div className={styles.gradientOrb2} />
        </div>
        
        <div className={styles.heroContent}>
          <div className={styles.badge}>
            <span className={styles.badgeDot} />
            100% Client-Side
          </div>
          
          <h1 className={styles.title}>
            Video to <span className={styles.highlight}>Spritesheet</span>
          </h1>
          
          <p className={styles.subtitle}>
            Extract frames from any video, select and reorder them, 
            then export as a game-ready spritesheet. 
            <strong> No uploads. No servers. Completely free.</strong>
          </p>
          
          <div className={styles.cta}>
            <Link href="/editor" className={styles.ctaButton}>
              <span>Start Creating</span>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className={styles.features}>
        <h2 className={styles.sectionTitle}>Everything You Need</h2>
        
        <div className={styles.featureGrid}>
          <div className={styles.feature}>
            <div className={styles.featureIcon}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
                <line x1="7" y1="2" x2="7" y2="22" />
                <line x1="17" y1="2" x2="17" y2="22" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <line x1="2" y1="7" x2="7" y2="7" />
                <line x1="2" y1="17" x2="7" y2="17" />
                <line x1="17" y1="17" x2="22" y2="17" />
                <line x1="17" y1="7" x2="22" y2="7" />
              </svg>
            </div>
            <h3>Frame Extraction</h3>
            <p>Load any video and extract frames at your desired FPS. Works with MP4, WebM, and more.</p>
          </div>
          
          <div className={styles.feature}>
            <div className={styles.featureIcon}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </div>
            <h3>Visual Editor</h3>
            <p>Select, reorder, and delete frames with an intuitive drag-and-drop interface.</p>
          </div>
          
          <div className={styles.feature}>
            <div className={styles.featureIcon}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            </div>
            <h3>Live Preview</h3>
            <p>Preview your animation in real-time with adjustable FPS before exporting.</p>
          </div>
          
          <div className={styles.feature}>
            <div className={styles.featureIcon}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </div>
            <h3>PNG + JSON Export</h3>
            <p>Download your spritesheet as PNG with optional JSON metadata for game engines.</p>
          </div>
          
          <div className={styles.feature}>
            <div className={styles.featureIcon}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <h3>Privacy First</h3>
            <p>Your files never leave your computer. Everything runs locally in your browser.</p>
          </div>
          
          <div className={styles.feature}>
            <div className={styles.featureIcon}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
            </div>
            <h3>Fast & Free</h3>
            <p>No sign-up, no watermarks, no limits. Just drag, drop, and create.</p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className={styles.ctaSection}>
        <div className={styles.ctaCard}>
          <h2>Ready to Create?</h2>
          <p>Turn your videos into game-ready spritesheets in seconds.</p>
          <Link href="/editor" className={styles.ctaButtonSecondary}>
            Open Editor
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <p>Built with Next.js • Open Source • Made for Game Developers</p>
      </footer>
    </main>
  );
}
