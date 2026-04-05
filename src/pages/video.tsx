import { Helmet } from "react-helmet-async";
import VideoTemplate from "@/components/video/VideoTemplate";

export default function VideoPage() {
  return (
    <>
      <Helmet>
        <title>Demo Video — VetTrack</title>
        <meta name="description" content="Watch a 90-second animated demo of VetTrack — the QR-based equipment tracking system built for veterinary hospitals and ER clinics." />
        <link rel="canonical" href="https://vettrack.replit.app/video" />
      </Helmet>
      <div className="w-screen h-screen overflow-hidden bg-black">
        <VideoTemplate />
      </div>
    </>
  );
}
