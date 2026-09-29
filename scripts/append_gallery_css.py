#!/usr/bin/env python3
"""Append gallery, lightbox, navigation, and store map button styles to assets/site.css."""

from pathlib import Path

css_path = Path("assets/site.css")
content = css_path.read_text(encoding="utf-8")

extra_css = """

/* ==========================================================================
   Interactive Product Gallery & Fullscreen Lightbox
   ========================================================================== */

.product-gallery {
  margin-bottom: 2rem;
}

.product-gallery-stage {
  position: relative;
  display: flex;
  align-items: center;
  margin-bottom: 1.25rem;
}

.product-detail-visual {
  position: relative;
  width: 100%;
  background: #ffffff;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  padding: 2.2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 340px;
  max-height: 520px;
  cursor: zoom-in;
  user-select: none;
  overflow: hidden;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.product-detail-visual:hover {
  border-color: var(--gold);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.06);
}

.product-detail-visual img {
  max-height: 420px;
  width: auto;
  max-width: 100%;
  object-fit: contain;
  transition: transform 0.25s ease;
}

.product-detail-visual:hover img {
  transform: scale(1.02);
}

/* Gallery navigation arrows on stage */
.gallery-nav-arrow {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 5;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(8px);
  border: 1px solid var(--line);
  color: var(--dark);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.2s, transform 0.2s, border-color 0.2s, color 0.2s, box-shadow 0.2s;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
}

.gallery-nav-arrow:hover {
  background: var(--dark);
  color: #ffffff;
  border-color: var(--dark);
  transform: translateY(-50%) scale(1.08);
}

.gallery-nav-arrow.gallery-prev {
  left: 14px;
}

.gallery-nav-arrow.gallery-next {
  right: 14px;
}

/* Zoom badge in corner */
.gallery-zoom-badge {
  position: absolute;
  bottom: 16px;
  right: 16px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(27, 27, 25, 0.82);
  backdrop-filter: blur(6px);
  color: #ffffff;
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 6px 14px;
  border-radius: 999px;
  pointer-events: none;
  transition: background 0.2s;
}

.product-detail-visual:hover .gallery-zoom-badge {
  background: var(--dark);
}

/* Gallery counter badge */
.gallery-counter {
  position: absolute;
  top: 16px;
  left: 16px;
  background: rgba(246, 244, 240, 0.92);
  backdrop-filter: blur(6px);
  border: 1px solid var(--line);
  color: var(--dark);
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  padding: 4px 12px;
  border-radius: 999px;
  pointer-events: none;
}

/* Thumbnails Row */
.product-gallery-row {
  display: flex;
  gap: 0.75rem;
  overflow-x: auto;
  padding: 6px 2px 12px;
  scroll-snap-type: x mandatory;
  scrollbar-width: thin;
}

.product-gallery-thumb {
  flex: 0 0 76px;
  height: 76px;
  border: 2px solid transparent;
  border-radius: 14px;
  padding: 4px;
  background: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  cursor: pointer;
  transition: border-color 0.2s, transform 0.2s, box-shadow 0.2s;
  scroll-snap-align: start;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);
}

.product-gallery-thumb img {
  max-height: 100%;
  max-width: 100%;
  object-fit: contain;
  pointer-events: none;
}

.product-gallery-thumb:hover {
  border-color: rgba(255, 178, 0, 0.5);
  transform: translateY(-2px);
}

.product-gallery-thumb.is-active {
  border-color: var(--gold) !important;
  box-shadow: 0 0 0 2px var(--gold), 0 4px 12px rgba(255, 178, 0, 0.25);
  transform: scale(1.04);
}

/* Lightbox Modal */
body.lightbox-open {
  overflow: hidden;
}

.lightbox-modal {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.25s ease, visibility 0.25s ease;
}

.lightbox-modal.is-open {
  opacity: 1;
  visibility: visible;
}

.lightbox-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(18, 18, 16, 0.94);
  backdrop-filter: blur(12px);
  cursor: zoom-out;
}

.lightbox-dialog {
  position: relative;
  z-index: 2;
  max-width: min(1200px, 94vw);
  max-height: 90vh;
  display: flex;
  align-items: center;
  justify-content: center;
}

.lightbox-media-wrap {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.lightbox-img {
  max-width: 90vw;
  max-height: 80vh;
  width: auto;
  height: auto;
  object-fit: contain;
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  transition: transform 0.2s ease;
  user-select: none;
}

.lightbox-caption-bar {
  margin-top: 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
  width: 100%;
  color: #ffffff;
  font-size: 0.92rem;
}

.lightbox-caption {
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
}

.lightbox-counter {
  background: rgba(255, 255, 255, 0.15);
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--gold);
}

.lightbox-close {
  position: fixed;
  top: 24px;
  right: 24px;
  z-index: 10;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.2s, transform 0.2s;
}

.lightbox-close:hover {
  background: var(--gold);
  color: var(--dark);
  transform: scale(1.1);
}

.lightbox-arrow {
  position: fixed;
  top: 50%;
  transform: translateY(-50%);
  z-index: 10;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.25);
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.2s, transform 0.2s;
}

.lightbox-arrow:hover {
  background: var(--gold);
  color: var(--dark);
  transform: translateY(-50%) scale(1.1);
}

.lightbox-arrow.lightbox-prev {
  left: 24px;
}

.lightbox-arrow.lightbox-next {
  right: 24px;
}

@media (max-width: 768px) {
  .lightbox-arrow.lightbox-prev { left: 10px; width: 44px; height: 44px; }
  .lightbox-arrow.lightbox-next { right: 10px; width: 44px; height: 44px; }
  .lightbox-close { top: 12px; right: 12px; width: 40px; height: 40px; }
}

/* ==========================================================================
   Page Navigation Elements & Buttons
   ========================================================================== */

.page-nav-bar {
  display: flex;
  align-items: center;
  gap: 1.2rem;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
}

.btn-back {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1.1rem;
  background: #ffffff;
  border: 1px solid var(--line);
  border-radius: 999px;
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--dark);
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s, transform 0.2s;
}

.btn-back:hover {
  background: var(--dark);
  color: #ffffff;
  border-color: var(--dark);
  transform: translateX(-3px);
}

.btn-back svg {
  transition: transform 0.2s;
}

.btn-back:hover svg {
  transform: translateX(-2px);
}

/* Floating Back-to-Top Button */
.scroll-top-btn {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 90;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 18px;
  background: var(--dark);
  color: #ffffff;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  cursor: pointer;
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.18);
  opacity: 0;
  visibility: hidden;
  transform: translateY(14px);
  transition: opacity 0.3s ease, visibility 0.3s ease, transform 0.3s ease, background 0.2s;
}

.scroll-top-btn.is-visible {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
}

.scroll-top-btn:hover {
  background: var(--gold);
  color: var(--dark);
  transform: translateY(-3px);
}

/* Product-to-Product Navigation Bar */
.product-nav-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  margin-top: 3.5rem;
  padding-top: 2rem;
  border-top: 1px solid var(--line);
  flex-wrap: wrap;
}

.pnav-btn {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  text-decoration: none;
  color: var(--dark);
  transition: transform 0.2s, color 0.2s;
  max-width: 45%;
}

.pnav-btn small {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--gold);
}

.pnav-btn span {
  font-size: 1.05rem;
  font-weight: 700;
  line-height: 1.3;
}

.pnav-prev:hover {
  transform: translateX(-4px);
}

.pnav-next {
  text-align: right;
  margin-left: auto;
}

.pnav-next:hover {
  transform: translateX(4px);
}

.pnav-all {
  font-size: 0.85rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  text-decoration: underline;
  text-underline-offset: 4px;
  color: var(--muted);
  transition: color 0.2s;
}

.pnav-all:hover {
  color: var(--dark);
}

/* Category Quick-Nav Bar */
.cat-quick-nav {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  margin: 1rem 0 2rem;
  overflow-x: auto;
  padding-bottom: 6px;
  scrollbar-width: thin;
}

.cat-quick-nav-label {
  font-size: 0.75rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--muted);
  white-space: nowrap;
}

.cat-quick-nav-pills {
  display: flex;
  gap: 0.6rem;
  white-space: nowrap;
}

.cat-nav-pill {
  display: inline-block;
  padding: 0.45rem 1rem;
  border-radius: 999px;
  background: #ffffff;
  border: 1px solid var(--line);
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--dark);
  text-decoration: none;
  transition: background 0.2s, border-color 0.2s, color 0.2s;
}

.cat-nav-pill:hover {
  border-color: var(--dark);
}

.cat-nav-pill.is-active {
  background: var(--dark);
  color: #ffffff;
  border-color: var(--dark);
}

/* Store Navigation Buttons (for every single address) */
.store-nav-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.8rem;
  padding: 0.55rem 1.15rem;
  background: var(--gold);
  color: var(--dark);
  border-radius: 999px;
  font-size: 0.82rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  text-decoration: none;
  transition: background 0.2s, transform 0.2s;
  width: fit-content;
}

.store-nav-btn:hover {
  background: #ffffff;
  color: var(--dark);
  transform: translateY(-2px);
}

.store-nav-btn svg {
  width: 15px;
  height: 15px;
  fill: currentColor;
}

.sidebar-store {
  padding: 0.85rem 0;
  border-bottom: 1px solid var(--line);
}

.sidebar-store:last-child {
  border-bottom: none;
}

.sidebar-store p {
  margin: 0 0 0.4rem;
}

.sidebar-map-link {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--gold);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.sidebar-map-link:hover {
  color: var(--ink);
}
"""

if ".product-gallery-stage" not in content:
    css_path.write_text(content + extra_css, encoding="utf-8")
    print("Appended gallery & navigation styles to site.css successfully.")
else:
    print("Styles already present.")
