"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

type Photo = { src: string; alt: string };

type PhotoCarouselProps = {
  photos: Photo[];
  className?: string;
  label: string;
  captions?: string[];
};

export function PhotoCarousel({ photos, className = "", label, captions }: PhotoCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (photos.length < 2) return;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % photos.length);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [photos.length]);

  const move = (direction: number) => {
    setActiveIndex((current) => (current + direction + photos.length) % photos.length);
  };

  return (
    <div className={`photo-carousel ${className}`} aria-label={label} aria-roledescription="carousel">
      <div className="photo-carousel-frame">
        {photos.map((photo, index) => (
          <div className={`photo-carousel-slide${index === activeIndex ? " is-active" : ""}`} key={photo.src} aria-hidden={index !== activeIndex}>
            <Image src={photo.src} alt={photo.alt} fill sizes={className.includes("hero") ? "100vw" : "(max-width: 768px) 100vw, 50vw"} priority={className.includes("hero") && index === 0} />
          </div>
        ))}
        {photos.length > 1 && (
          <>
            <button className="carousel-arrow carousel-previous" type="button" onClick={() => move(-1)} aria-label="Ảnh trước">←</button>
            <button className="carousel-arrow carousel-next" type="button" onClick={() => move(1)} aria-label="Ảnh tiếp theo">→</button>
            <div className="carousel-dots" aria-label="Chọn ảnh">
              {photos.map((photo, index) => <button key={photo.src} type="button" className={`carousel-dot${index === activeIndex ? " is-active" : ""}`} aria-label={`Ảnh ${index + 1}`} aria-current={index === activeIndex ? "true" : undefined} onClick={() => setActiveIndex(index)} />)}
            </div>
          </>
        )}
      </div>
      {captions && <p className="carousel-caption" aria-live="polite">{captions[activeIndex]}</p>}
    </div>
  );
}
