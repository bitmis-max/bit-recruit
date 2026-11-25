"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

type Photo = { src: string; alt: string };

export function EventsHeroSlider({ photos }: { photos: Photo[] }) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (photos.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % photos.length);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [photos.length]);

  return (
    <div className="events-hero-slider" aria-roledescription="carousel" aria-label="Ảnh hoạt động của BIT">
      {photos.map((photo, index) => {
        const isActive = index === activeIndex;
        const isNear = isActive || index === (activeIndex + 1) % photos.length;
        return (
          <div className={`events-hero-slide${isActive ? " is-active" : ""}`} key={photo.src} aria-hidden={!isActive}>
            {isNear && (
              <Image src={photo.src} alt={photo.alt} fill sizes="100vw" priority={index === 0} className="events-hero-image" />
            )}
          </div>
        );
      })}
      {photos.length > 1 && (
        <div className="events-hero-dots" aria-label="Chọn ảnh">
          {photos.map((photo, index) => (
            <button
              key={photo.src}
              type="button"
              className={`events-hero-dot${index === activeIndex ? " is-active" : ""}`}
              aria-label={`Ảnh ${index + 1}`}
              aria-current={index === activeIndex ? "true" : undefined}
              onClick={() => setActiveIndex(index)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
