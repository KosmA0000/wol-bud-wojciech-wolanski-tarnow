(() => {
  'use strict';

  // ==========================================================================
  // 1. Mobile Menu / Header Panel Toggle
  // ==========================================================================
  const menu = document.getElementById('menu');
  const menuButton = document.getElementById('menuButton');
  const menuPanel = document.querySelector('[data-menu-panel]');
  const mobileQuery = window.matchMedia('(max-width: 760px)');
  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mobileNavLinks = document.querySelectorAll('[data-mobile-home-href]');

  const syncMobileNavLinks = () => {
    mobileNavLinks.forEach((link) => {
      link.setAttribute('href', mobileQuery.matches ? link.dataset.mobileHomeHref : link.dataset.desktopHref);
    });
  };
  syncMobileNavLinks();
  mobileQuery.addEventListener('change', syncMobileNavLinks);
  const isHomePage = Boolean(document.getElementById('start') && document.getElementById('oferta'));

  const closeMenu = (returnFocus = false) => {
    if (!menu || !menuButton) return;
    menu.classList.remove('open');
    menuButton.setAttribute('aria-expanded', 'false');
    menuPanel?.setAttribute('hidden', '');
    document.body.classList.remove('menu-open');
    if (returnFocus) menuButton.focus();
  };

  const scrollToTarget = (target, updateHash = false) => {
    if (!target) return;
    if (updateHash && target.id) history.pushState(null, '', `#${target.id}`);
    target.scrollIntoView({ behavior: reducedMotionQuery.matches ? 'auto' : 'smooth', block: 'start' });
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  };

  const responsiveDetails = Array.from(document.querySelectorAll('[data-responsive-disclosure]'));
  const applyResponsiveDetails = () => {
    responsiveDetails.forEach((detail) => {
      detail.open = !mobileQuery.matches;
    });
  };
  applyResponsiveDetails();
  mobileQuery.addEventListener('change', applyResponsiveDetails);

  if (menu && menuButton) {
    const toggleMenu = () => {
      const isOpen = menu.classList.toggle('open');
      menuButton.setAttribute('aria-expanded', String(isOpen));
      if (menuPanel) {
        if (isOpen) {
          menuPanel.removeAttribute('hidden');
          document.body.classList.add('menu-open');
        } else {
          menuPanel.setAttribute('hidden', '');
          document.body.classList.remove('menu-open');
        }
      }
    };

    menuButton.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMenu();
    });

    menu.querySelector('[data-menu-close]')?.addEventListener('click', () => closeMenu(true));

    mobileNavLinks.forEach((link) => {
      link.addEventListener('click', (e) => {
        if (!mobileQuery.matches || !isHomePage) return;
        const targetId = new URL(link.href, window.location.href).hash.slice(1);
        const target = targetId ? document.getElementById(decodeURIComponent(targetId)) : null;
        if (!target) return;
        e.preventDefault();
        closeMenu();
        scrollToTarget(target, true);
      });
    });

    document.addEventListener('click', (e) => {
      if (menu.classList.contains('open') && !menu.contains(e.target)) {
        closeMenu();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && menu.classList.contains('open')) {
        closeMenu(true);
      }
    });
  }

  // ==========================================================================
  // 2. Reviews Carousel Navigation
  // ==========================================================================
  const reviewsTrack = document.getElementById('reviewsTrack');
  const prevBtn = document.querySelector('.rev-prev');
  const nextBtn = document.querySelector('.rev-next');

  if (reviewsTrack && prevBtn && nextBtn) {
    const getScrollStep = () => {
      const firstCard = reviewsTrack.querySelector('.review');
      return firstCard ? firstCard.offsetWidth + 18 : 340;
    };

    prevBtn.addEventListener('click', () => {
      reviewsTrack.scrollBy({ left: -getScrollStep(), behavior: 'smooth' });
    });

    nextBtn.addEventListener('click', () => {
      reviewsTrack.scrollBy({ left: getScrollStep(), behavior: 'smooth' });
    });
  }

  // ==========================================================================
  // 3. Homepage Section Tracking & Smart Breadcrumbs / Back Navigation
  // ==========================================================================
  if (isHomePage) {
    // Record which section user clicks from
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a');
      if (link && !link.getAttribute('href')?.startsWith('#')) {
        const sec = link.closest('section[id]');
        if (sec && sec.id) {
          sessionStorage.setItem('wolbud_source_section', sec.id);
        }
      }
    });

    // Also update on scroll
    const sections = document.querySelectorAll('main section[id]');
    if ('IntersectionObserver' in window && sections.length > 0) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting && entry.intersectionRatio > 0.3) {
            sessionStorage.setItem('wolbud_source_section', entry.target.id);
          }
        });
      }, { threshold: [0.3] });

      sections.forEach(s => observer.observe(s));
    }

    // If landed with hash, ensure smooth scroll to that section (not hero)
    if (window.location.hash) {
      const target = document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
      if (target) {
        setTimeout(() => {
          scrollToTarget(target);
        }, 120);
      }
    }
  } else {
    // On subpages: adjust breadcrumb home links so they return to the originating section
    const sourceSection = sessionStorage.getItem('wolbud_source_section') || 'oferta';
    document.querySelectorAll('[data-home-link]').forEach(a => {
      const orig = a.getAttribute('href') || './';
      const base = orig.includes('#') ? orig.split('#')[0] : orig;
      a.setAttribute('href', (base || './') + '#' + sourceSection);
    });

    // History back button
    document.querySelectorAll('[data-history-back]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (window.history.length > 1 && document.referrer.includes(window.location.host)) {
          window.history.back();
        } else {
          const homeA = document.querySelector('[data-home-link]');
          if (homeA && homeA.getAttribute('href')) {
            window.location.href = homeA.getAttribute('href');
          } else {
            window.location.href = './#' + (sessionStorage.getItem('wolbud_source_section') || 'oferta');
          }
        }
      });
    });
  }

  // ==========================================================================
  // 4. Interactive Product Gallery & Fullscreen Lightbox
  // ==========================================================================
  const gallery = document.querySelector('[data-gallery]');
  const lightboxModal = document.getElementById('lightboxModal');

  if (gallery) {
    const mainImg = gallery.querySelector('[data-gallery-main]');
    const prevArrow = gallery.querySelector('[data-gallery-prev]');
    const nextArrow = gallery.querySelector('[data-gallery-next]');
    const currBadge = gallery.querySelector('[data-gallery-curr]');
    const thumbs = Array.from(gallery.querySelectorAll('[data-gallery-thumbs] button'));
    const zoomTrigger = gallery.querySelector('[data-gallery-trigger]');

    // Collect list of image URLs and captions
    const images = [];
    if (thumbs.length > 0) {
      thumbs.forEach(t => {
        const src = t.getAttribute('data-src') || t.querySelector('img')?.getAttribute('src') || '';
        const alt = t.querySelector('img')?.getAttribute('alt') || mainImg?.alt || 'Zdjęcie produktu';
        images.push({ src, alt });
      });
    } else if (mainImg) {
      images.push({ src: mainImg.src, alt: mainImg.alt || 'Zdjęcie produktu' });
    }

    let currentIndex = 0;

    const updateGalleryView = (index) => {
      if (images.length === 0) return;
      currentIndex = (index + images.length) % images.length;

      const activeItem = images[currentIndex];
      if (mainImg && activeItem) {
        mainImg.src = activeItem.src;
        mainImg.alt = activeItem.alt;
      }

      if (currBadge) {
        currBadge.textContent = String(currentIndex + 1);
      }

      thumbs.forEach((t, i) => {
        const isActive = i === currentIndex;
        t.classList.toggle('is-active', isActive);
        t.setAttribute('aria-current', String(isActive));
        if (isActive) {
          t.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
      });
    };

    if (prevArrow) {
      prevArrow.addEventListener('click', (e) => {
        e.stopPropagation();
        updateGalleryView(currentIndex - 1);
      });
    }

    if (nextArrow) {
      nextArrow.addEventListener('click', (e) => {
        e.stopPropagation();
        updateGalleryView(currentIndex + 1);
      });
    }

    thumbs.forEach((t, idx) => {
      t.addEventListener('click', (e) => {
        e.preventDefault();
        updateGalleryView(idx);
      });
    });

    // Keyboard navigation when gallery has focus
    gallery.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') {
        updateGalleryView(currentIndex - 1);
      } else if (e.key === 'ArrowRight') {
        updateGalleryView(currentIndex + 1);
      }
    });

    // ------------------------------------------------------------------------
    // Lightbox Logic
    // ------------------------------------------------------------------------
    if (lightboxModal) {
      const lbImg = document.getElementById('lightboxImg');
      const lbCaption = document.getElementById('lightboxCaption');
      const lbCounter = document.getElementById('lightboxCounter');
      const lbPrev = lightboxModal.querySelector('[data-lightbox-prev]');
      const lbNext = lightboxModal.querySelector('[data-lightbox-next]');

      let lbIndex = 0;

      const updateLightbox = (index) => {
        if (images.length === 0) return;
        lbIndex = (index + images.length) % images.length;
        const item = images[lbIndex];

        if (lbImg) {
          lbImg.src = item.src;
          lbImg.alt = item.alt;
        }
        if (lbCaption) {
          lbCaption.textContent = item.alt;
        }
        if (lbCounter) {
          lbCounter.textContent = `${lbIndex + 1} / ${images.length}`;
        }

        // Also sync page gallery view
        updateGalleryView(lbIndex);
      };

      const openLightbox = (startIndex) => {
        lightboxModal.removeAttribute('hidden');
        // Force reflow for smooth opacity transition
        lightboxModal.offsetHeight;
        lightboxModal.classList.add('is-open');
        document.body.classList.add('lightbox-open');
        updateLightbox(startIndex);
      };

      const closeLightbox = () => {
        lightboxModal.classList.remove('is-open');
        document.body.classList.remove('lightbox-open');
        setTimeout(() => {
          lightboxModal.setAttribute('hidden', '');
        }, 260);
      };

      if (zoomTrigger) {
        zoomTrigger.addEventListener('click', () => {
          openLightbox(currentIndex);
        });
      }

      if (lbPrev) {
        lbPrev.addEventListener('click', (e) => {
          e.stopPropagation();
          updateLightbox(lbIndex - 1);
        });
      }

      if (lbNext) {
        lbNext.addEventListener('click', (e) => {
          e.stopPropagation();
          updateLightbox(lbIndex + 1);
        });
      }

      lightboxModal.querySelectorAll('[data-lightbox-close]').forEach(el => {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          closeLightbox();
        });
      });

      document.addEventListener('keydown', (e) => {
        if (!lightboxModal.hasAttribute('hidden') && lightboxModal.classList.contains('is-open')) {
          if (e.key === 'Escape') {
            closeLightbox();
          } else if (e.key === 'ArrowLeft') {
            updateLightbox(lbIndex - 1);
          } else if (e.key === 'ArrowRight') {
            updateLightbox(lbIndex + 1);
          }
        }
      });

      // Touch swipe support in Lightbox
      let touchStartX = 0;
      let touchEndX = 0;
      lightboxModal.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
      }, { passive: true });

      lightboxModal.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        if (touchStartX - touchEndX > 50) {
          updateLightbox(lbIndex + 1); // swipe left -> next
        } else if (touchEndX - touchStartX > 50) {
          updateLightbox(lbIndex - 1); // swipe right -> prev
        }
      }, { passive: true });
    }
  }

  // ==========================================================================
  // 5. Floating "Do góry" (Back to Top) Button
  // ==========================================================================
  const scrollTopBtn = document.getElementById('scrollTopBtn');
  if (scrollTopBtn) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 320) {
        scrollTopBtn.classList.add('is-visible');
        scrollTopBtn.removeAttribute('hidden');
      } else {
        scrollTopBtn.classList.remove('is-visible');
      }
    }, { passive: true });

    scrollTopBtn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: reducedMotionQuery.matches ? 'auto' : 'smooth' });
    });
  }

  // ==========================================================================
  // 6. Smooth Anchor Scroll
  // ==========================================================================
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', function (e) {
      const targetId = this.getAttribute('href');
      if (targetId.length > 1) {
        const targetEl = document.querySelector(targetId);
        if (targetEl) {
          e.preventDefault();
          if (menu && menu.classList.contains('open')) {
            closeMenu();
          }
          scrollToTarget(targetEl, true);
        }
      }
    });
  });
})();
