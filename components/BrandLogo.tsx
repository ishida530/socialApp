import Image from 'next/image';

type BrandLogoProps = {
  alt?: string;
  width?: number;
  height?: number;
  className?: string;
  priority?: boolean;
};

export function BrandLogo({
  alt = 'Postfly',
  width = 925,
  height = 314,
  className = 'h-14 w-auto',
  priority = false,
}: BrandLogoProps) {
  return (
    <Image
      src="/logo.png"
      alt={alt}
      width={width}
      height={height}
      className={className}
      priority={priority}
    />
  );
}
