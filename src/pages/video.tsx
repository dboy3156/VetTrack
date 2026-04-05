import { Helmet } from "react-helmet-async";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import VideoTemplate from "@/components/video/VideoTemplate";

export default function VideoPage() {
  return (
    <>
      <Helmet>
        <title>Demo Video — VetTrack</title>
        <meta name="description" content="Watch a 90-second animated demo of VetTrack — the QR-based equipment tracking system built for veterinary hospitals and ER clinics." />
        <link rel="canonical" href="https://vettrack.replit.app/video" />
      </Helmet>
      <div className="relative w-screen h-screen overflow-hidden bg-black">
        <Link
          href="/landing"
          className="absolute top-4 left-4 z-50 inline-flex items-center gap-1.5 bg-black/60 hover:bg-black/80 text-white text-sm font-medium px-3 py-2 rounded-xl backdrop-blur transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to VetTrack
        </Link>
        <VideoTemplate />
      </div>
    </>
  );
}
