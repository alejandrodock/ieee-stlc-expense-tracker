import { Coffee, Car, Printer, Trophy, Package, Receipt, CarTaxiFront, type LucideIcon } from 'lucide-react';
import { getCategoriaColor } from '@/lib/constants';

const ICONS: Record<string, LucideIcon> = {
  catering: Coffee,
  transporte: Car,
  imprenta: Printer,
  hackathon: Trophy,
  materiales: Package,
  operativos: CarTaxiFront,
};

export default function CategoryIcon({ categoria, size = 'md' }: { categoria: string; size?: 'sm' | 'md' }) {
  const Icon = ICONS[categoria] ?? Receipt;
  const color = getCategoriaColor(categoria);
  const box = size === 'sm' ? 'w-7 h-7 rounded-lg' : 'w-9 h-9 rounded-xl';
  const icon = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';
  return (
    <span
      className={`${box} flex-shrink-0 inline-flex items-center justify-center border`}
      style={{ color, backgroundColor: `${color}14`, borderColor: `${color}2e` }}
    >
      <Icon className={icon} strokeWidth={1.75} />
    </span>
  );
}
