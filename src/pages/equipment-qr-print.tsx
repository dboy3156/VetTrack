import { useEffect } from 'react';
import { useParams } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { generateQrUrl } from '@/lib/utils';
import { t } from '@/lib/i18n';
import { useAuth } from '@/hooks/use-auth';
import { authFetch } from '@/lib/auth-fetch';
import { safePrintPage } from '@/lib/safe-browser';

export default function EquipmentQRPrint() {
  const { id } = useParams<{ id: string }>();
  const { userId } = useAuth();
  const url = generateQrUrl(id!);

  const { data: equipment, isSuccess } = useQuery({
    queryKey: ['/api/equipment', id ?? ''],
    queryFn: async () => {
      const response = await authFetch(`/api/equipment/${id}`);
      return response.json();
    },
    enabled: Boolean(id && userId),
    retry: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (isSuccess) {
      const timer = setTimeout(() => safePrintPage(), 800);
      return () => clearTimeout(timer);
    }
  }, [isSuccess]);

  if (!equipment) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh' }}>
        <p>{t.common.loading}</p>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100dvh',
      backgroundColor: '#ffffff',
      padding: '32px',
      fontFamily: 'sans-serif',
    }}>
      <QRCodeSVG value={url} size={256} level="H" includeMargin />
      <h2 style={{ marginTop: '16px', fontSize: '20px', fontWeight: 'bold', textAlign: 'center' }}>
        {equipment.name}
      </h2>
      <p style={{ fontSize: '14px', color: '#666', margin: '4px 0' }}>{equipment.serialNumber}</p>
      <p style={{ fontSize: '14px', color: '#666', margin: '4px 0' }}>{equipment.location}</p>
      <p style={{ fontSize: '11px', color: '#aaa', marginTop: '8px', wordBreak: 'break-all', textAlign: 'center', maxWidth: '280px' }}>{url}</p>
    </div>
  );
}
