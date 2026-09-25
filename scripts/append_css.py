#!/usr/bin/env python3
"""Append rich product and category CSS styles to assets/css/site.css."""

from pathlib import Path

css_path = Path("assets/css/site.css")
content = css_path.read_text(encoding="utf-8")

extra_css = """

/* ==========================================================================
   Category & Product Grids (Rich Awwwards Showcase - No Empty Space)
   ========================================================================== */

.cat-products-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1.5rem;
  margin: 2rem 0;
}

.cat-prod-card {
  background: #ffffff;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  transition: transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease;
  text-decoration: none;
  color: inherit;
}

.cat-prod-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 14px 34px rgba(27, 27, 25, 0.08);
  border-color: var(--gold);
}

.cat-prod-media {
  aspect-ratio: 16 / 11;
  background: #faf8f5;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: 1.2rem;
  border-bottom: 1px solid rgba(27, 27, 25, 0.06);
}

.cat-prod-media img {
  max-height: 100%;
  max-width: 100%;
  object-fit: contain;
  transition: transform 0.35s ease;
}

.cat-prod-card:hover .cat-prod-media img {
  transform: scale(1.06);
}

.cat-prod-body {
  padding: 1.25rem 1.4rem;
  display: flex;
  flex-direction: column;
  flex-grow: 1;
}

.cat-prod-tag {
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--gold);
  margin-bottom: 0.4rem;
}

.cat-prod-title {
  font-size: 1.18rem;
  font-weight: 700;
  line-height: 1.3;
  margin: 0 0 0.5rem;
  color: var(--dark);
  letter-spacing: -0.02em;
}

.cat-prod-snippet {
  font-size: 0.88rem;
  line-height: 1.5;
  color: var(--muted);
  margin: 0 0 1.2rem;
  flex-grow: 1;
}

.cat-prod-btn {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--dark);
  padding-top: 0.8rem;
  border-top: 1px solid rgba(27, 27, 25, 0.08);
  margin-top: auto;
}

.cat-prod-btn span {
  font-size: 1.1rem;
  color: var(--gold);
  transition: transform 0.2s ease;
}

.cat-prod-card:hover .cat-prod-btn span {
  transform: translate(3px, -3px);
}

/* Subcategories Grid */
.subcat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1.5rem;
  margin: 2rem 0;
}

.subcat-card {
  background: #ffffff;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  transition: transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease;
  text-decoration: none;
  color: inherit;
}

.subcat-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 14px 34px rgba(27, 27, 25, 0.08);
  border-color: var(--gold);
}

.subcat-card-media {
  aspect-ratio: 16 / 10;
  background: #faf8f5;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.2rem;
  border-bottom: 1px solid rgba(27, 27, 25, 0.06);
}

.subcat-card-media img {
  max-height: 100%;
  max-width: 100%;
  object-fit: contain;
  transition: transform 0.35s ease;
}

.subcat-card:hover .subcat-card-media img {
  transform: scale(1.05);
}

.subcat-card-body {
  padding: 1.4rem;
  display: flex;
  flex-direction: column;
  flex-grow: 1;
}

.subcat-card-count {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--gold);
  margin-bottom: 0.4rem;
}

.subcat-card-body h3 {
  font-size: 1.25rem;
  font-weight: 700;
  margin: 0 0 0.5rem;
  color: var(--dark);
  letter-spacing: -0.02em;
}

.subcat-card-body p {
  font-size: 0.9rem;
  line-height: 1.55;
  color: var(--muted);
  margin: 0 0 1.2rem;
  flex-grow: 1;
}

/* Product Detail Page */
.product-detail-visual {
  background: #ffffff;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  padding: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1.5rem;
  min-height: 320px;
}

.product-detail-visual img {
  max-height: 380px;
  width: auto;
  max-width: 100%;
  object-fit: contain;
}

.product-gallery-row {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin-bottom: 2.5rem;
}

.product-gallery-thumb {
  width: 76px;
  height: 76px;
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 6px;
  background: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  transition: border-color 0.2s, transform 0.2s;
}

.product-gallery-thumb:hover {
  border-color: var(--gold);
  transform: scale(1.05);
}

.product-gallery-thumb img {
  max-height: 100%;
  max-width: 100%;
  object-fit: contain;
}

.product-specs-box {
  background: #ffffff;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  padding: 1.8rem 2rem;
  margin: 2.2rem 0;
}

.product-specs-box h3 {
  font-size: 1.25rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: -0.02em;
  margin: 0 0 1.2rem;
  padding-bottom: 0.8rem;
  border-bottom: 1px solid var(--line);
  color: var(--dark);
}

.specs-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 0.85rem;
}

.specs-list li {
  display: flex;
  align-items: flex-start;
  gap: 0.85rem;
  font-size: 0.95rem;
  line-height: 1.55;
  color: rgba(27, 27, 25, 0.88);
}

.specs-list li .chk {
  color: var(--gold);
  font-weight: 800;
  font-size: 1.15rem;
  line-height: 1.2;
  flex-shrink: 0;
}

.product-downloads-box {
  background: var(--accent-soft);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  padding: 1.6rem 2rem;
  margin: 2rem 0;
}

.product-downloads-box h3 {
  font-size: 1.15rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: -0.02em;
  margin: 0 0 1rem;
}

.pdf-btn-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem;
}

.pdf-download-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.75rem 1.25rem;
  background: #ffffff;
  border: 1px solid var(--line);
  border-radius: 999px;
  font-size: 0.88rem;
  font-weight: 600;
  text-decoration: none;
  color: var(--dark);
  transition: background 0.2s, border-color 0.2s, transform 0.2s;
}

.pdf-download-btn:hover {
  background: var(--dark);
  color: #ffffff;
  border-color: var(--dark);
  transform: translateY(-2px);
}

.pdf-download-btn svg {
  width: 16px;
  height: 16px;
  color: var(--gold);
}

/* Services Page & Cards */
.service-card {
  background: #ffffff;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  padding: clamp(2rem, 4vw, 3rem);
  margin-bottom: 2rem;
  scroll-margin-top: 100px;
}

.service-card__num {
  font-size: 0.78rem;
  font-weight: 800;
  color: var(--gold);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  margin-bottom: 0.6rem;
}

.service-card h2 {
  font-size: clamp(1.6rem, 2.8vw, 2.3rem);
  font-weight: 700;
  margin: 0 0 1.2rem;
  border: none !important;
  padding-top: 0 !important;
  letter-spacing: -0.03em;
  text-transform: uppercase;
}

.service-card p {
  font-size: 1.02rem;
  line-height: 1.7;
  color: rgba(27, 27, 25, 0.85);
  margin-bottom: 1rem;
}

.service-card ul {
  list-style: none;
  padding: 0;
  margin: 1.2rem 0;
  display: grid;
  gap: 0.6rem;
}

.service-card ul li {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  font-size: 0.96rem;
  line-height: 1.5;
}

.service-card ul li::before {
  content: "—";
  color: var(--gold);
  font-weight: 800;
}

.service-feature-box {
  background: var(--dark);
  color: #ffffff;
  border-radius: var(--radius-md);
  padding: 1.5rem 2rem;
  margin-top: 1.5rem;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1.2rem;
}

.service-feature-box p {
  margin: 0;
  color: rgba(255, 255, 255, 0.85);
  font-size: 0.95rem;
}

.service-feature-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  background: var(--gold);
  color: var(--dark);
  padding: 0.75rem 1.4rem;
  border-radius: 999px;
  font-size: 0.85rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  text-decoration: none;
  transition: transform 0.2s, background 0.2s;
}

.service-feature-btn:hover {
  background: #ffffff;
  transform: translateY(-2px);
}

/* Warm Montage Page */
.montage-steps-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1.5rem;
  margin: 2.5rem 0;
}

.montage-step-card {
  background: #ffffff;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  transition: transform 0.25s ease, box-shadow 0.25s ease;
}

.montage-step-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 30px rgba(27, 27, 25, 0.08);
}

.montage-step-media {
  aspect-ratio: 4 / 3;
  background: #faf8f5;
  overflow: hidden;
}

.montage-step-media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.35s ease;
}

.montage-step-card:hover .montage-step-media img {
  transform: scale(1.05);
}

.montage-step-info {
  padding: 1.25rem 1.4rem;
}

.montage-step-n {
  font-size: 0.74rem;
  font-weight: 800;
  color: var(--gold);
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.montage-step-title {
  font-size: 1.1rem;
  font-weight: 700;
  margin: 0.35rem 0 0;
  color: var(--dark);
  line-height: 1.35;
}

/* Homepage Intuitive Catalog & Services */
.home-catalog-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1.25rem;
  margin-bottom: 2.5rem;
}

@media (max-width: 1024px) {
  .home-catalog-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 600px) {
  .home-catalog-grid {
    grid-template-columns: 1fr;
  }
}

.home-cat-card {
  background: #ffffff;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  text-decoration: none;
  color: inherit;
  transition: transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease;
}

.home-cat-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 14px 34px rgba(27, 27, 25, 0.08);
  border-color: var(--gold);
}

.home-cat-thumb {
  aspect-ratio: 16 / 11;
  background: #faf8f5;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.2rem;
  border-bottom: 1px solid rgba(27, 27, 25, 0.06);
}

.home-cat-thumb img {
  max-height: 100%;
  max-width: 100%;
  object-fit: contain;
  transition: transform 0.35s ease;
}

.home-cat-card:hover .home-cat-thumb img {
  transform: scale(1.06);
}

.home-cat-body {
  padding: 1.25rem 1.4rem;
  display: flex;
  flex-direction: column;
  flex-grow: 1;
}

.home-cat-body h3 {
  font-size: 1.18rem;
  font-weight: 700;
  line-height: 1.3;
  margin: 0 0 0.4rem;
  color: var(--dark);
  letter-spacing: -0.02em;
}

.home-cat-body p {
  font-size: 0.88rem;
  line-height: 1.5;
  color: var(--muted);
  margin: 0 0 1rem;
  flex-grow: 1;
}

.home-cat-cta {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--dark);
  padding-top: 0.75rem;
  border-top: 1px solid rgba(27, 27, 25, 0.08);
}

.home-cat-cta span {
  color: var(--gold);
  font-size: 1.1rem;
  transition: transform 0.2s ease;
}

.home-cat-card:hover .home-cat-cta span {
  transform: translate(3px, -3px);
}

.home-services-box {
  background: var(--accent-soft);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  padding: clamp(2rem, 3.5vw, 3rem);
  margin-bottom: 3rem;
}

.home-services-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 1.8rem;
  flex-wrap: wrap;
  gap: 1rem;
}

.home-services-head h3 {
  font-size: clamp(1.4rem, 2.2vw, 2rem);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: -0.02em;
  margin: 0;
}

.home-services-head a {
  font-size: 0.85rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--dark);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.home-services-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 1rem;
}

.home-service-item {
  background: #ffffff;
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 1.25rem 1.4rem;
  display: flex;
  flex-direction: column;
  text-decoration: none;
  color: inherit;
  transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s;
}

.home-service-item:hover {
  transform: translateY(-3px);
  box-shadow: 0 10px 24px rgba(27, 27, 25, 0.06);
  border-color: var(--gold);
}

.home-service-item-n {
  font-size: 0.72rem;
  font-weight: 800;
  color: var(--gold);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  margin-bottom: 0.35rem;
}

.home-service-item h4 {
  font-size: 1.05rem;
  font-weight: 700;
  margin: 0 0 0.4rem;
  color: var(--dark);
}

.home-service-item p {
  font-size: 0.86rem;
  line-height: 1.5;
  color: var(--muted);
  margin: 0 0 0.8rem;
  flex-grow: 1;
}

.home-service-item .arr {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--gold);
  align-self: flex-end;
}
"""

if ".cat-products-grid" not in content:
    css_path.write_text(content + extra_css, encoding="utf-8")
    print("Appended rich styles to site.css successfully.")
else:
    print("Styles already present in site.css.")
