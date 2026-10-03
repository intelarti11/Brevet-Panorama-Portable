import type { FC } from 'react';
import { cn } from '@/lib/utils';

interface LogoProps {
  className?: string;
}

const Logo: FC<LogoProps> = ({ className }) => {
  return (
    <div className={cn('font-headline text-3xl font-bold text-primary', className)}>
      Brevet Panorama
    </div>
  );
};

export default Logo;
