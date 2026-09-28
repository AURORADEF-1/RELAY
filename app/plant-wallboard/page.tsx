import { AuthGuard } from '@/components/auth-guard';
import { PlantWallboard } from '@/components/plant-wallboard/board';
export default function PlantWallboardPage() {
  return <AuthGuard requiredRole="admin"><PlantWallboard /></AuthGuard>;
}
