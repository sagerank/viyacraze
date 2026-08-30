/**
 * VIYACRAZE — High-Performance 60FPS Frame Scrubbing Engine
 * Mobile Navigation Drawer + Sticky Bar + Ambient Liquid Follower
 */

(function () {
  'use strict';

  // --- Configuration ---
  const TOTAL_FRAMES = 240;
  const EAGER_FRAMES = 30;          // frames loaded + decoded before the preloader finishes
  const DECODE_AHEAD = 10;          // frames kept pre-decoded around the playhead
  const FRAME_DIR = 'frames/';
  const FRAME_PREFIX = 'frame_';
  const FRAME_EXT = '.webp';
  const HERO_IMAGE_SRC = 'viyahero-gold.jpeg';
  const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const padIndex = (num) => String(num).padStart(4, '0');

  // State Management
  const state = {
    heroImage: null,
    heroLoaded: false,
    frames: new Array(TOTAL_FRAMES),
    loadedCount: 0,
    currentFrameIndex: 0,
    targetFrameIndex: 0,
    lastRenderedIndex: -1,
    isLoaded: false,
    rafActive: false,
    scrollProgress: 0
  };

  // DOM Elements
  const preloader = document.getElementById('preloader');
  const progressBar = document.getElementById('progressBar');
  const loadingPercent = document.getElementById('loadingPercent');
  const loadingStatusText = document.getElementById('loadingStatusText');
  const canvas = document.getElementById('heroCanvas');
  const ctx = canvas ? canvas.getContext('2d', { alpha: false, desynchronized: true }) : null;
  const scrollSection = document.getElementById('scroll-experience');
  const scrubThumb = document.getElementById('scrubThumb');
  const currentFrameNumber = document.getElementById('currentFrameNumber');
  const scrollDirective = document.getElementById('scrollDirective');
  const storyCards = document.querySelectorAll('.story-card');
  const liquidMesh = document.getElementById('liquidMesh');
  const mobileMenuToggle = document.getElementById('mobileMenuToggle');
  const mobileDrawer = document.getElementById('mobileDrawer');
  const mobileDrawerClose = document.getElementById('mobileDrawerClose');
  const mobileStickyBar = document.getElementById('mobileStickyBar');

  // --- 1. Mobile Drawer Navigation Controller ---
  function openMobileDrawer() {
    if (mobileDrawer) {
      mobileDrawer.classList.add('active');
      document.body.classList.add('drawer-open');
      if (mobileMenuToggle) {
        mobileMenuToggle.classList.add('active');
        mobileMenuToggle.setAttribute('aria-expanded', 'true');
      }
    }
  }

  function closeMobileDrawer() {
    if (mobileDrawer) {
      mobileDrawer.classList.remove('active');
      document.body.classList.remove('drawer-open');
      if (mobileMenuToggle) {
        mobileMenuToggle.classList.remove('active');
        mobileMenuToggle.setAttribute('aria-expanded', 'false');
      }
    }
  }

  if (mobileMenuToggle) {
    mobileMenuToggle.addEventListener('click', () => {
      const isOpen = mobileDrawer && mobileDrawer.classList.contains('active');
      if (isOpen) {
        closeMobileDrawer();
      } else {
        openMobileDrawer();
      }
    });
  }

  if (mobileDrawerClose) {
    mobileDrawerClose.addEventListener('click', closeMobileDrawer);
  }

  // Close drawer when any mobile nav link is clicked
  const mobileNavLinks = document.querySelectorAll('.mobile-nav-link');
  mobileNavLinks.forEach((link) => {
    link.addEventListener('click', closeMobileDrawer);
  });

  // --- 2. Ambient Liquid Mesh Follower (Desktop Only) ---
  if (liquidMesh && window.matchMedia('(pointer: fine)').matches) {
    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let currentX = mouseX;
    let currentY = mouseY;

    window.addEventListener('mousemove', (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    }, { passive: true });

    const animateMesh = () => {
      currentX += (mouseX - currentX) * 0.08;
      currentY += (mouseY - currentY) * 0.08;
      // Compositor-only transform (left/top would trigger layout every frame)
      liquidMesh.style.transform = `translate3d(${currentX.toFixed(1)}px, ${currentY.toFixed(1)}px, 0) translate(-50%, -50%)`;
      requestAnimationFrame(animateMesh);
    };
    requestAnimationFrame(animateMesh);
  }

  // --- 3. Progressive Asset Preloader (eager first 30, rest stream in background) ---
  function loadFrame(i, eager) {
    return new Promise((resolve) => {
      const img = new Image();
      const framePath = `${FRAME_DIR}${FRAME_PREFIX}${padIndex(i)}${FRAME_EXT}`;

      img.onload = async () => {
        if (eager && 'decode' in img) {
          try { await img.decode(); } catch (e) {}
          img.__decoded = true;
        }
        state.frames[i - 1] = img;
        resolve();
      };
      img.onerror = () => {
        if (eager) console.warn(`Could not load frame: ${framePath}`);
        resolve();
      };
      img.src = framePath;
    });
  }

  function loadRemainingFrames() {
    let next = EAGER_FRAMES + 1;
    const batch = () => {
      const end = Math.min(next + 16, TOTAL_FRAMES + 1);
      const jobs = [];
      for (; next < end; next++) jobs.push(loadFrame(next, false));
      Promise.all(jobs).then(() => {
        if (next <= TOTAL_FRAMES) setTimeout(batch, 100);
      });
    };
    batch();
  }

  async function preloadAssets() {
    if (!canvas || !ctx) return;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'medium';

    const totalAssets = EAGER_FRAMES + 1;
    let loadedAssets = 0;

    const updateProgress = () => {
      loadedAssets++;
      state.loadedCount = loadedAssets;
      const percent = Math.round((loadedAssets / totalAssets) * 100);
      if (progressBar) progressBar.style.width = `${percent}%`;
      if (loadingPercent) loadingPercent.textContent = `${percent}%`;

      if (loadedAssets >= totalAssets) {
        onAllAssetsLoaded();
      }
    };

    // Load & Decode Hero Image
    const heroImg = new Image();
    heroImg.src = HERO_IMAGE_SRC;
    heroImg.onload = async () => {
      try {
        if ('decode' in heroImg) await heroImg.decode();
      } catch (e) {}
      state.heroImage = heroImg;
      state.heroLoaded = true;
      updateProgress();
    };
    heroImg.onerror = () => {
      console.warn(`Could not load hero image: ${HERO_IMAGE_SRC}`);
      updateProgress();
    };

    // Load & Decode the eager opening frames only — the preloader no longer
    // blocks on all 240 frames (13 MB); the rest stream in after start.
    for (let i = 1; i <= EAGER_FRAMES; i++) {
      loadFrame(i, true).then(updateProgress);
    }
  }

  function onAllAssetsLoaded() {
    state.isLoaded = true;
    if (loadingStatusText) loadingStatusText.textContent = 'VIYA SEQUENCE INITIALIZED';

    setTimeout(() => {
      document.body.classList.remove('is-loading');
      if (preloader) preloader.classList.add('is-done');

      resizeCanvas();
      forceRender(0);
      wakeRender();
      loadRemainingFrames();
    }, 300);
  }

  // --- 4. Canvas Sizing ---
  function resizeCanvas() {
    if (!canvas || !ctx) return;

    // Source frames are 1280x720 — rendering above 1x DPR only multiplies
    // fill cost for an upscaled image, so the canvas stays at 1:1 CSS pixels.
    const dpr = 1;
    const width = window.innerWidth;
    const height = window.innerHeight;

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'medium';

    state.lastRenderedIndex = -1;
    forceRender(Math.round(state.currentFrameIndex));
  }

  if (canvas) {
    window.addEventListener('resize', debounce(resizeCanvas, 80));
    window.addEventListener('orientationchange', () => setTimeout(resizeCanvas, 150));
  }

  function drawImageCover(img) {
    if (!img || !img.complete || img.naturalWidth === 0 || !ctx) return;

    const cw = canvas.width;
    const ch = canvas.height;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;

    const ratio = Math.max(cw / iw, ch / ih);
    const nw = Math.round(iw * ratio);
    const nh = Math.round(ih * ratio);
    const ox = Math.round((cw - nw) / 2);
    const oy = Math.round((ch - nh) / 2);

    ctx.drawImage(img, 0, 0, iw, ih, ox, oy, nw, nh);
  }

  // Keep the next DECODE_AHEAD frames decoded so scrubbing never stalls on a
  // synchronous main-thread decode.
  function ensureDecoded(frameIndex) {
    const last = Math.min(frameIndex + DECODE_AHEAD, TOTAL_FRAMES);
    for (let i = Math.max(1, frameIndex); i <= last; i++) {
      const img = state.frames[i - 1];
      if (img && img.complete && !img.__decoding && !img.__decoded) {
        img.__decoding = true;
        const done = () => { img.__decoded = true; wakeRender(); };
        if ('decode' in img) img.decode().then(done, done);
        else img.__decoded = true;
      }
    }
  }

  // Returns true when the frame was drawn (or is permanently unavailable) so
  // the render loop knows whether it must keep spinning for a pending decode.
  function forceRender(frameIndex) {
    if (!ctx) return true;

    const clampedIndex = Math.max(0, Math.min(TOTAL_FRAMES, frameIndex));

    if (clampedIndex === 0) {
      if (state.heroImage && state.heroLoaded) {
        drawImageCover(state.heroImage);
      } else if (state.frames[0]) {
        drawImageCover(state.frames[0]);
      }
      if (currentFrameNumber) currentFrameNumber.textContent = 'HERO';
      state.lastRenderedIndex = clampedIndex;
      return true;
    }

    const img = state.frames[clampedIndex - 1];
    if (!img || !img.complete) {
      // Frame still streaming in the background — accept and move on.
      state.lastRenderedIndex = clampedIndex;
      return true;
    }
    if (!img.__decoded) {
      ensureDecoded(clampedIndex);
      return false;
    }

    drawImageCover(img);
    if (currentFrameNumber) {
      currentFrameNumber.textContent = padIndex(clampedIndex).slice(1);
    }
    state.lastRenderedIndex = clampedIndex;
    return true;
  }

  // --- 5. Scroll-Driven Timeline & Sticky Mobile Bar Reveal ---
  function onScroll() {
    const scrollY = window.scrollY || window.pageYOffset;

    // Sticky Mobile Bar Reveal
    if (mobileStickyBar) {
      if (scrollY > 300) {
        mobileStickyBar.classList.add('visible');
      } else {
        mobileStickyBar.classList.remove('visible');
      }
    }

    if (!scrollSection) return;

    const rect = scrollSection.getBoundingClientRect();
    const scrollDistance = scrollSection.offsetHeight - window.innerHeight;
    const scrolled = -rect.top;

    let progress = scrolled / scrollDistance;
    progress = Math.max(0, Math.min(1, progress));
    state.scrollProgress = progress;

    if (progress <= 0.008) {
      state.targetFrameIndex = 0;
    } else {
      const videoProg = (progress - 0.008) / (1 - 0.008);
      state.targetFrameIndex = 1 + videoProg * (TOTAL_FRAMES - 1);
    }

    if (scrubThumb) {
      const track = scrubThumb.parentElement;
      const trackH = track ? track.clientHeight : 180;
      const thumbH = scrubThumb.clientHeight || 24;
      const maxTravel = Math.max(0, trackH - thumbH);
      scrubThumb.style.transform = `translateY(${progress * maxTravel}px)`;
    }

    if (scrollDirective) {
      scrollDirective.style.opacity = progress > 0.03 ? '0' : '1';
    }

    updateStoryCards(progress * 100);
    wakeRender();
  }

  function updateStoryCards(percentage) {
    storyCards.forEach((card) => {
      const range = card.getAttribute('data-range').split('-').map(Number);
      const [start, end] = range;

      if (percentage >= start && percentage <= end) {
        card.classList.add('active');
      } else {
        card.classList.remove('active');
      }
    });
  }

  function renderLoop() {
    if (!canvas) return;

    const lerpSpeed = REDUCED_MOTION ? 1 : 0.20;
    const diff = state.targetFrameIndex - state.currentFrameIndex;

    if (Math.abs(diff) > 0.01) {
      state.currentFrameIndex += diff * lerpSpeed;
    } else {
      state.currentFrameIndex = state.targetFrameIndex;
    }

    ensureDecoded(Math.round(state.currentFrameIndex));

    let drew = true;
    const roundedIndex = Math.round(state.currentFrameIndex);

    if (roundedIndex !== state.lastRenderedIndex) {
      drew = forceRender(roundedIndex);
    }

    // Park the loop when the scrub is settled — it wakes on scroll or decode.
    if (!drew || state.currentFrameIndex !== state.targetFrameIndex) {
      requestAnimationFrame(renderLoop);
    } else {
      state.rafActive = false;
    }
  }

  function wakeRender() {
    if (canvas && !state.rafActive) {
      state.rafActive = true;
      requestAnimationFrame(renderLoop);
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('touchmove', onScroll, { passive: true });
  document.addEventListener('scroll', onScroll, { passive: true });

  // --- 6. Interactive FAQ Accordion (Contact Page) ---
  const faqItems = document.querySelectorAll('.faq-item');
  faqItems.forEach((item) => {
    const questionBtn = item.querySelector('.faq-question');
    if (questionBtn) {
      questionBtn.addEventListener('click', () => {
        const isActive = item.classList.contains('active');
        faqItems.forEach((i) => i.classList.remove('active'));
        if (!isActive) {
          item.classList.add('active');
        }
      });
    }
  });

  // --- 7. Contact Form Handler ---
  window.handleContactSubmit = function (e) {
    e.preventDefault();
    const successBox = document.getElementById('contactSuccessMsg');
    const form = document.getElementById('contactForm');

    if (successBox && form) {
      successBox.style.display = 'flex';
      form.querySelectorAll('input, select, textarea, button').forEach((el) => {
        el.disabled = true;
      });
    }
  };

  // --- 8. VIP Newsletter Handler ---
  window.handleNewsletter = function (e) {
    e.preventDefault();
    const input = document.getElementById('emailInput');
    const successMsg = document.getElementById('newsletterSuccess');

    if (input && input.value) {
      input.disabled = true;
      if (successMsg) successMsg.style.display = 'flex';
    }
  };

  // --- 9. Editorial Lookbook Fullscreen Lightbox Controller ---
  const lightbox = document.getElementById('lookbookLightbox');
  const lightboxImg = document.getElementById('lightboxImg');
  const lightboxCaption = document.getElementById('lightboxCaption');
  const lightboxClose = document.getElementById('lightboxClose');
  const mosaicItems = document.querySelectorAll('.mosaic-item');

  function openLightbox(imgSrc, captionText) {
    if (lightbox && lightboxImg && lightboxCaption) {
      lightboxImg.src = imgSrc;
      lightboxCaption.textContent = captionText;
      lightbox.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
  }

  function closeLightbox() {
    if (lightbox) {
      lightbox.classList.remove('active');
      document.body.style.overflow = '';
    }
  }

  mosaicItems.forEach((item) => {
    item.addEventListener('click', () => {
      const img = item.querySelector('img');
      const caption = item.querySelector('.mosaic-caption');
      if (img) {
        const captionText = caption ? caption.textContent.trim() : 'VIYACRAZE Official Editorial';
        openLightbox(img.src, captionText);
      }
    });
  });

  if (lightboxClose) {
    lightboxClose.addEventListener('click', closeLightbox);
  }

  if (lightbox) {
    lightbox.addEventListener('click', (e) => {
      if (e.target === lightbox) {
        closeLightbox();
      }
    });
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && lightbox && lightbox.classList.contains('active')) {
      closeLightbox();
    }
  });

  // --- 10. 3D Card Gyroscope & Cursor Parallax Tilt (Desktop & Pointer Fine) ---
  if (window.matchMedia('(pointer: fine)').matches) {
    const tiltElements = document.querySelectorAll('.mosaic-item, .anatomy-card, .origin-image-wrap, .pillar-card');

    tiltElements.forEach((el) => {
      el.addEventListener('mousemove', (e) => {
        const rect = el.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const rotateX = ((y - centerY) / centerY) * -6;
        const rotateY = ((x - centerX) / centerX) * 6;

        el.style.transform = `perspective(1000px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) translateY(-4px)`;
      });

      el.addEventListener('mouseleave', () => {
        el.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0)';
      });
    });
  }

  // --- 11. Service Worker Registration (PWA & Offline Frame Cache) ---
  if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('SW registration skipped:', err);
      });
    });
  }

  // --- 12. Utility: Debounce ---
  function debounce(func, wait) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  // --- 13. UI Detail Pass: reveals, count-up, magnetic buttons, cursor ---
  const FINE_POINTER = window.matchMedia('(pointer: fine)').matches;

  // Staggered scroll-reveal for every card/metric grid (JS-tagged so no-JS
  // visitors always see the content).
  const revealables = document.querySelectorAll(
    '.anatomy-card, .pillar-card, .timeline-step, .mosaic-item, .channel-card, .faq-item, .metric-item, .cta-inner, .contact-form-wrap'
  );
  if (revealables.length && 'IntersectionObserver' in window && !REDUCED_MOTION) {
    const groups = new Map();
    revealables.forEach((el) => {
      el.classList.add('rv');
      const parent = el.parentElement;
      const idx = groups.get(parent) || 0;
      groups.set(parent, idx + 1);
      el.style.setProperty('--rv-i', Math.min(idx, 6));
    });
    const revealIO = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          revealIO.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    revealables.forEach((el) => revealIO.observe(el));
  }

  // Count-up on the anatomy stat numbers (240 / 100%) when they enter view.
  const statNumbers = document.querySelectorAll('.anatomy-card .stat-number');
  if (statNumbers.length && 'IntersectionObserver' in window) {
    const animateCount = (el) => {
      const raw = el.textContent.trim();
      const match = raw.match(/^(\d+)(%?)$/);
      if (!match) return;
      const target = parseInt(match[1], 10);
      const suffix = match[2];
      if (!target || REDUCED_MOTION) return;
      const duration = 1100;
      const startAt = performance.now();
      const tick = (now) => {
        const t = Math.min(1, (now - startAt) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        el.textContent = Math.round(target * eased) + suffix;
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    const countIO = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          animateCount(entry.target);
          countIO.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });
    statNumbers.forEach((el) => countIO.observe(el));
  }

  // Magnetic hover pull on primary buttons (desktop, motion-safe only).
  if (FINE_POINTER && !REDUCED_MOTION) {
    document.querySelectorAll('.liquid-btn').forEach((btn) => {
      btn.addEventListener('mousemove', (e) => {
        const rect = btn.getBoundingClientRect();
        const dx = (e.clientX - rect.left - rect.width / 2) / rect.width;
        const dy = (e.clientY - rect.top - rect.height / 2) / rect.height;
        btn.style.transform = `translate(${(dx * 8).toFixed(1)}px, ${(dy * 6 - 2).toFixed(1)}px)`;
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.transform = '';
      });
    });
  }

  // Custom gold cursor: dot + trailing ring (desktop, motion-safe only).
  if (FINE_POINTER && !REDUCED_MOTION && !('ontouchstart' in window)) {
    document.documentElement.classList.add('has-cursor');
    const dot = document.createElement('div');
    dot.className = 'cursor-dot';
    const ring = document.createElement('div');
    ring.className = 'cursor-ring';
    document.body.append(dot, ring);

    let cx = innerWidth / 2, cy = innerHeight / 2, rx = cx, ry = cy;
    let mouseX = cx, mouseY = cy;
    let cursorRaf = false;
    const renderCursor = () => {
      cx += (mouseX - cx) * 0.55;
      cy += (mouseY - cy) * 0.55;
      rx += (mouseX - rx) * 0.16;
      ry += (mouseY - ry) * 0.16;
      dot.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
      ring.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
      cursorRaf = false;
    };
    window.addEventListener('mousemove', (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      dot.classList.add('is-visible');
      ring.classList.add('is-visible');
      if (!cursorRaf) { cursorRaf = true; requestAnimationFrame(renderCursor); }
    }, { passive: true });
    document.addEventListener('mouseleave', () => {
      dot.classList.remove('is-visible');
      ring.classList.remove('is-visible');
    });
    const hoverSel = 'a, button, .mosaic-item, .faq-question, input, textarea, select, label';
    document.addEventListener('mouseover', (e) => {
      if (e.target.closest && e.target.closest(hoverSel)) ring.classList.add('is-hover');
      else ring.classList.remove('is-hover');
    });
  }

  // Initialize
  window.addEventListener('DOMContentLoaded', () => {
    if (canvas) {
      preloadAssets();
    } else {
      document.body.classList.remove('is-loading');
    }
  });
})();
