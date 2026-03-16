import { notFound } from 'next/navigation';
import CameraTestPanel from '../../../components/CameraTestPanel';

export const metadata = {
  title: 'Teste Mobile de Camera'
};

export default function DevCameraPage() {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  return (
    <main>
      <CameraTestPanel />
    </main>
  );
}
