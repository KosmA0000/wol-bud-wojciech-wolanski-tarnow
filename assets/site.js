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

  // Direct links to a service section reveal its full copy without a second tap.
  const revealAnchoredDisclosure = () => {
    const id = window.location.hash.slice(1);
    if (!id) return;
    let target = null;
    try { target = document.getElementById(decodeURIComponent(id)); } catch (_) {}
    const disclosure = target?.matches('details[data-responsive-disclosure]')
      ? target
      : target?.querySelector('details[data-responsive-disclosure]');
    if (disclosure) disclosure.open = true;
  };
  window.addEventListener('hashchange', revealAnchoredDisclosure);
  if (window.location.hash) requestAnimationFrame(revealAnchoredDisclosure);

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
  /* Legacy product-only gallery controller replaced by the shared controller below.
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

  */

  // ============================================================================
  // 4. Shared product galleries, image groups, and lightbox
  // ============================================================================
  const lightboxModal = document.getElementById('lightboxModal');
  if (lightboxModal) {
    const lightboxImg = document.getElementById('lightboxImg');
    const lightboxCaption = document.getElementById('lightboxCaption');
    const lightboxCounter = document.getElementById('lightboxCounter');
    const lightboxPrev = lightboxModal.querySelector('[data-lightbox-prev]');
    const lightboxNext = lightboxModal.querySelector('[data-lightbox-next]');
    let currentItems = [];
    let currentIndex = 0;
    let syncCurrentGallery = null;
    let closeTimer = 0;
    let returnFocusTo = null;

    const modalIsOpen = () => lightboxModal.classList.contains('is-open');
    const showLightboxItem = (index) => {
      if (!currentItems.length) return;
      currentIndex = (index + currentItems.length) % currentItems.length;
      const item = currentItems[currentIndex];
      lightboxImg.src = item.src;
      lightboxImg.alt = item.alt || '';
      lightboxCaption.textContent = item.caption || item.alt || '';
      lightboxCounter.textContent = `${currentIndex + 1} / ${currentItems.length}`;
      const hasNeighbors = currentItems.length > 1;
      lightboxPrev.hidden = !hasNeighbors;
      lightboxNext.hidden = !hasNeighbors;
      if (syncCurrentGallery) syncCurrentGallery(currentIndex);
    };

    const openLightbox = (items, index, syncGallery, focusTarget) => {
      if (!items.length) return;
      window.clearTimeout(closeTimer);
      currentItems = items;
      syncCurrentGallery = syncGallery || null;
      returnFocusTo = focusTarget || document.activeElement;
      lightboxModal.removeAttribute('hidden');
      lightboxModal.offsetHeight;
      lightboxModal.classList.add('is-open');
      document.body.classList.add('lightbox-open');
      showLightboxItem(index);
      lightboxModal.querySelector('[data-lightbox-close]')?.focus({ preventScroll: true });
    };

    const closeLightbox = () => {
      if (!modalIsOpen()) return;
      lightboxModal.classList.remove('is-open');
      document.body.classList.remove('lightbox-open');
      closeTimer = window.setTimeout(() => {
        lightboxModal.setAttribute('hidden', '');
        lightboxImg.removeAttribute('src');
        syncCurrentGallery = null;
        returnFocusTo?.focus?.({ preventScroll: true });
      }, 260);
    };

    document.querySelectorAll('[data-gallery]').forEach((gallery) => {
      const mainImg = gallery.querySelector('[data-gallery-main]');
      const trigger = gallery.querySelector('[data-gallery-trigger]');
      const previous = gallery.querySelector('[data-gallery-prev]');
      const next = gallery.querySelector('[data-gallery-next]');
      const counter = gallery.querySelector('[data-gallery-curr]');
      const thumbs = Array.from(gallery.querySelectorAll('[data-gallery-thumbs] .product-gallery-thumb'));
      const items = thumbs.map((thumb) => {
        const image = thumb.querySelector('img');
        const alt = image?.alt || mainImg?.alt || '';
        return {
          src: thumb.dataset.src || image?.currentSrc || image?.src || '',
          alt,
          ratio: thumb.dataset.ratio || '1.4',
          caption: alt
        };
      }).filter((item) => item.src);

      if (!items.length && mainImg?.src) {
        const alt = mainImg.alt || '';
        items.push({ src: mainImg.src, alt, ratio: '1.4', caption: alt });
      }

      let index = 0;
      const sizeStageFrame = (item) => {
        if (!trigger || !item) return;
        const ratio = Math.max(0.2, Number.parseFloat(item.ratio) || 1.4);
        const availableWidth = gallery.clientWidth || window.innerWidth;
        const maxHeight = Math.min(window.innerHeight * 0.72, 680);
        const width = Math.max(1, Math.min(availableWidth, maxHeight * ratio));
        const height = width / ratio;
        const stage = gallery.querySelector('.product-gallery-stage');
        if (stage) {
          stage.style.width = `${width}px`;
          stage.style.marginInline = 'auto';
        }
        trigger.style.width = `${width}px`;
        trigger.style.height = `${height}px`;
        trigger.style.setProperty('--gallery-ratio', String(ratio));
      };
      const showGalleryItem = (nextIndex) => {
        if (!items.length) return;
        index = (nextIndex + items.length) % items.length;
        const item = items[index];
        mainImg.src = item.src;
        mainImg.alt = item.alt;
        sizeStageFrame(item);
        if (counter) counter.textContent = String(index + 1);
        thumbs.forEach((thumb, thumbIndex) => {
          const active = thumbIndex === index;
          thumb.classList.toggle('is-active', active);
          thumb.setAttribute('aria-current', String(active));
          if (active) thumb.scrollIntoView({ behavior: reducedMotionQuery.matches ? 'auto' : 'smooth', block: 'nearest', inline: 'center' });
        });
      };

      thumbs.forEach((thumb, thumbIndex) => {
        thumb.addEventListener('click', () => showGalleryItem(thumbIndex));
      });
      previous?.addEventListener('click', (event) => {
        event.stopPropagation();
        showGalleryItem(index - 1);
      });
      next?.addEventListener('click', (event) => {
        event.stopPropagation();
        showGalleryItem(index + 1);
      });
      trigger?.addEventListener('click', () => {
        openLightbox(items, index, showGalleryItem, trigger);
      });
      gallery.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault();
          showGalleryItem(index + (event.key === 'ArrowRight' ? 1 : -1));
        }
      });
      window.addEventListener('resize', () => sizeStageFrame(items[index]), { passive: true });
      showGalleryItem(0);
    });

    const lightboxTriggers = Array.from(document.querySelectorAll('[data-lightbox-trigger][data-lightbox-src]'));
    const itemForTrigger = (trigger) => {
      const image = trigger.matches('img') ? trigger : trigger.querySelector('img');
      const src = trigger.getAttribute('data-lightbox-src') || image?.currentSrc || image?.src || '';
      const alt = image?.alt || trigger.getAttribute('aria-label') || '';
      return { src, alt, caption: alt };
    };

    lightboxTriggers.forEach((trigger) => {
      trigger.addEventListener('click', (event) => {
        const group = trigger.getAttribute('data-lightbox-group');
        const groupTriggers = group
          ? lightboxTriggers.filter((candidate) => candidate.getAttribute('data-lightbox-group') === group)
          : [trigger];
        const items = groupTriggers.map(itemForTrigger).filter((item) => item.src);
        const index = Math.max(0, groupTriggers.indexOf(trigger));
        event.preventDefault();
        event.stopPropagation();
        openLightbox(items, index, null, trigger);
      });
    });

    lightboxPrev?.addEventListener('click', (event) => {
      event.stopPropagation();
      showLightboxItem(currentIndex - 1);
    });
    lightboxNext?.addEventListener('click', (event) => {
      event.stopPropagation();
      showLightboxItem(currentIndex + 1);
    });
    lightboxModal.querySelectorAll('[data-lightbox-close]').forEach((element) => {
      element.addEventListener('click', (event) => {
        event.stopPropagation();
        closeLightbox();
      });
    });
    document.addEventListener('keydown', (event) => {
      if (!modalIsOpen()) return;
      if (event.key === 'Escape') closeLightbox();
      else if (event.key === 'ArrowLeft') showLightboxItem(currentIndex - 1);
      else if (event.key === 'ArrowRight') showLightboxItem(currentIndex + 1);
    });

    let touchStartX = 0;
    lightboxModal.addEventListener('touchstart', (event) => {
      touchStartX = event.changedTouches[0].screenX;
    }, { passive: true });
    lightboxModal.addEventListener('touchend', (event) => {
      const distance = touchStartX - event.changedTouches[0].screenX;
      if (distance > 50) showLightboxItem(currentIndex + 1);
      else if (distance < -50) showLightboxItem(currentIndex - 1);
    }, { passive: true });
  }

  const filledImageFrames = document.querySelectorAll('.cat-prod-media, .subcat-card-media, .home-cat-thumb, .montage-step-media, .home-featured-media');
  filledImageFrames.forEach((frame) => {
    const image = frame.querySelector('img');
    if (!image) return;
    const applyFrameImage = () => {
      const src = image.currentSrc || image.src;
      if (src) frame.style.setProperty('--frame-image', `url("${src}")`);
    };
    applyFrameImage();
    image.addEventListener('load', applyFrameImage);
  });

  // Horizontal thumbnail and photo strips share the same arrow behavior.
  document.querySelectorAll('[data-scroll-gallery]').forEach((strip) => {
    const track = strip.querySelector('[data-scroll-track]');
    const previous = strip.querySelector('[data-scroll-prev]');
    const next = strip.querySelector('[data-scroll-next]');
    if (!track || !previous || !next) return;

    const refreshControls = () => {
      const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
      const canScroll = maxScroll > 2;
      previous.hidden = !canScroll;
      next.hidden = !canScroll;
      previous.disabled = track.scrollLeft <= 2;
      next.disabled = track.scrollLeft >= maxScroll - 2;
      previous.setAttribute('aria-disabled', String(previous.disabled));
      next.setAttribute('aria-disabled', String(next.disabled));
    };
    const scrollStep = () => Math.max(track.clientWidth * 0.8, track.querySelector(':scope > *')?.getBoundingClientRect().width || 0);

    previous.addEventListener('click', () => track.scrollBy({ left: -scrollStep(), behavior: reducedMotionQuery.matches ? 'auto' : 'smooth' }));
    next.addEventListener('click', () => track.scrollBy({ left: scrollStep(), behavior: reducedMotionQuery.matches ? 'auto' : 'smooth' }));
    track.addEventListener('scroll', refreshControls, { passive: true });
    window.addEventListener('resize', refreshControls, { passive: true });
    refreshControls();
  });

  // ============================================================================
  // 5. Floating "Do góry" (Back to Top) Button
  // ============================================================================
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
