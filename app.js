/**
 * VIYACRAZE — High-Performance 60FPS Frame Scrubbing Engine
 * Mobile Navigation Drawer + Sticky Bar + Ambient Liquid Follower
 */

(function () {
  'use strict';

  // --- Configuration ---
  const TOTAL_FRAMES = 240;
  const FRAME_DIR = 'frames/';
  const FRAME_PREFIX = 'frame_';
  const FRAME_EXT = '.webp';
  const HERO_IMAGE_SRC = 'viyahero.jpeg';

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
      liquidMesh.style.left = `${currentX}px`;
      liquidMesh.style.top = `${currentY}px`;
      requestAnimationFrame(animateMesh);
    };
    requestAnimationFrame(animateMesh);
  }

  // --- 3. Robust Asset Preloader with Bitmap / GPU Decode ---
  async function preloadAssets() {
    if (!canvas || !ctx) return;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const totalAssets = TOTAL_FRAMES + 1;
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

    // Load & Decode All 240 Frames
    for (let i = 1; i <= TOTAL_FRAMES; i++) {
      const img = new Image();
      const framePath = `${FRAME_DIR}${FRAME_PREFIX}${padIndex(i)}${FRAME_EXT}`;
      const frameIndex = i - 1;

      img.src = framePath;
      img.onload = async () => {
        try {
          if ('decode' in img) await img.decode();
        } catch (e) {}
        state.frames[frameIndex] = img;
        updateProgress();
      };
      img.onerror = () => {
        console.warn(`Could not load frame: ${framePath}`);
        updateProgress();
      };
    }
  }

  function onAllAssetsLoaded() {
    state.isLoaded = true;
    if (loadingStatusText) loadingStatusText.textContent = 'ATELIER SEQUENCE INITIALIZED';

    setTimeout(() => {
      document.body.classList.remove('is-loading');
      if (preloader) preloader.classList.add('is-done');

      resizeCanvas();
      forceRender(0);
      requestAnimationFrame(renderLoop);
    }, 300);
  }

  // --- 4. High-DPI Pixel-Perfect Canvas Sizing ---
  function resizeCanvas() {
    if (!canvas || !ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = window.innerWidth;
    const height = window.innerHeight;

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

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

  function forceRender(frameIndex) {
    if (!ctx) return;

    const clampedIndex = Math.max(0, Math.min(TOTAL_FRAMES, frameIndex));

    if (clampedIndex === 0) {
      if (state.heroImage && state.heroLoaded) {
        drawImageCover(state.heroImage);
      } else if (state.frames[0]) {
        drawImageCover(state.frames[0]);
      }
      if (currentFrameNumber) currentFrameNumber.textContent = 'HERO';
    } else {
      const img = state.frames[clampedIndex - 1];
      if (img && img.complete) {
        drawImageCover(img);
      }
      if (currentFrameNumber) {
        currentFrameNumber.textContent = padIndex(clampedIndex).slice(1);
      }
    }

    state.lastRenderedIndex = clampedIndex;
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

    const lerpSpeed = 0.20;
    const diff = state.targetFrameIndex - state.currentFrameIndex;

    if (Math.abs(diff) > 0.01) {
      state.currentFrameIndex += diff * lerpSpeed;
    } else {
      state.currentFrameIndex = state.targetFrameIndex;
    }

    const roundedIndex = Math.round(state.currentFrameIndex);

    if (roundedIndex !== state.lastRenderedIndex) {
      forceRender(roundedIndex);
    }

    requestAnimationFrame(renderLoop);
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

  // --- 7. Atelier Contact Form Handler ---
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

  // --- 9. Utility: Debounce ---
  function debounce(func, wait) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
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
