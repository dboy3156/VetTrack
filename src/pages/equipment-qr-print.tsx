import { useEffect } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { QRCodeSVG } from "qrcode.react";
import { request } from "@/lib/api";
import type { Equipment } from "@/types";

export default function EquipmentQrPrintPage() {
  const { id } = useParams<{ id: string }>();
  const equipmentId = id ?? "";
  const equipmentUrl = `https://vettrack.uk/equipment/${equipmentId}`;

  const { data: equipment } = useQuery({
    queryKey: [`/api/equipment/${equipmentId}`],
    queryFn: () => request<Equipment>(`/api/equipment/${equipmentId}`),
    enabled: !!equipmentId,
  });

  useEffect(() => {
    if (!equipment) return;

    const timeoutId = window.setTimeout(() => {
      window.print();
    }, 500);

    return () => window.clearTimeout(timeoutId);
  }, [equipment]);

  if (!equipment) return null;

  return (
    <>
      <Helmet>
        <title>Print QR — {equipment.name}</title>
      </Helmet>
      <div className="print-area min-h-screen bg-white p-8 flex items-center justify-center">
        <div className="flex flex-col items-center text-center max-w-md">
          <QRCodeSVG value={equipmentUrl} size={320} level="H" includeMargin />
          <h1 className="mt-6 text-2xl font-bold text-black">{equipment.name}</h1>
          {equipment.serialNumber && (
            <p className="mt-1 text-base text-gray-700">{equipment.serialNumber}</p>
          )}
          {equipment.location && (
            <p className="mt-1 text-base text-gray-700">{equipment.location}</p>
          )}
          <p className="mt-3 text-xs text-gray-500 break-all">{equipmentUrl}</p>
        </div>
      </div>
    </>
  );
}
