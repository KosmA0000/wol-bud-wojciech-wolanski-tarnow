(() => {
  'use strict';




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




  const reviewsTrack = document.getElementById('reviewsTrack');
  const prevBtn = document.querySelector('.rev-prev');
  const nextBtn = document.querySelector('.rev-next');

  if (reviewsTrack && prevBtn && nextBtn) {

    const getScrollStep = () => {
      const firstCard = reviewsTrack.querySelector('.review');
      const gap = parseFloat(getComputedStyle(reviewsTrack).columnGap) || 16;
      return firstCard ? firstCard.getBoundingClientRect().width + gap : 320;
    };
    const syncArrows = () => {
      const max = reviewsTrack.scrollWidth - reviewsTrack.clientWidth;
      prevBtn.disabled = reviewsTrack.scrollLeft <= 2;
      nextBtn.disabled = reviewsTrack.scrollLeft >= max - 2;
    };

    prevBtn.addEventListener('click', () => {
      reviewsTrack.scrollBy({ left: -getScrollStep(), behavior: 'smooth' });
    });

    nextBtn.addEventListener('click', () => {
      reviewsTrack.scrollBy({ left: getScrollStep(), behavior: 'smooth' });
    });

    reviewsTrack.addEventListener('scroll', syncArrows, { passive: true });
    window.addEventListener('resize', syncArrows);
    syncArrows();
  }




  if (isHomePage) {

    document.addEventListener('click', (e) => {
      const link = e.target.closest('a');
      if (link && !link.getAttribute('href')?.startsWith('#')) {
        const sec = link.closest('section[id]');
        if (sec && sec.id) {
          sessionStorage.setItem('wolbud_source_section', sec.id);
        }
      }
    });


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


    if (window.location.hash) {
      const target = document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
      if (target) {
        setTimeout(() => {
          scrollToTarget(target);
        }, 120);
      }
    }
  } else {

    const sourceSection = sessionStorage.getItem('wolbud_source_section') || 'oferta';
    document.querySelectorAll('[data-home-link]').forEach(a => {
      const orig = a.getAttribute('href') || './';
      const base = orig.includes('#') ? orig.split('#')[0] : orig;
      a.setAttribute('href', (base || './') + '#' + sourceSection);
    });


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


  document.querySelectorAll('[data-palette]').forEach((palette) => {
    const preview = palette.querySelector('[data-palette-image]');
    const swatches = Array.from(palette.querySelectorAll('[data-palette-src]'));
    if (!preview) return;
    swatches.forEach((swatch) => {
      swatch.addEventListener('click', () => {
        preview.src = swatch.getAttribute('data-palette-src');
        preview.alt = swatch.querySelector('img')?.alt || '';
        swatches.forEach((other) => other.setAttribute('aria-pressed', String(other === swatch)));

        const box = preview.getBoundingClientRect();
        const headerBottom = document.querySelector('header.bar')?.getBoundingClientRect().bottom || 0;
        if (box.top < headerBottom || box.bottom > window.innerHeight) {
          preview.scrollIntoView({ block: 'start', behavior: reducedMotionQuery.matches ? 'auto' : 'smooth' });
        }
      });
    });
  });




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








  const mailLinks = document.querySelectorAll('a[href^="mailto:"]');
  if (mailLinks.length) {
    const desktopPointerQuery = window.matchMedia('(hover: hover) and (pointer: fine)');
    const copyToast = document.createElement('div');
    copyToast.className = 'copy-toast';
    copyToast.setAttribute('role', 'status');
    document.body.appendChild(copyToast);
    let copyToastTimer = 0;


    const copyText = (text) => {
      const active = document.activeElement;
      const field = document.createElement('textarea');
      field.value = text;
      field.setAttribute('readonly', '');
      field.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px;';
      document.body.appendChild(field);
      field.focus({ preventScroll: true });
      field.select();
      field.setSelectionRange(0, text.length);
      let copied = false;
      try { copied = document.execCommand('copy'); } catch (err) { copied = false; }
      field.remove();
      if (active && active.focus) active.focus({ preventScroll: true });
      if (copied) return Promise.resolve();
      return navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject();
    };

    mailLinks.forEach((link) => {
      link.addEventListener('click', (e) => {
        const address = link.getAttribute('href').slice('mailto:'.length).split('?')[0];
        copyText(address).then(() => {
          copyToast.textContent = `Skopiowano adres: ${address}`;
          copyToast.classList.add('is-visible');
          clearTimeout(copyToastTimer);
          copyToastTimer = setTimeout(() => copyToast.classList.remove('is-visible'), 3000);
        }).catch(() => {});
        if (desktopPointerQuery.matches) e.preventDefault();
      });
    });
  }
})();
