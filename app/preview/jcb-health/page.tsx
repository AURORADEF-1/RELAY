import { notFound } from "next/navigation";
import { HealthPreview } from "@/components/jcb/health-preview";
export default function Preview(){if(process.env.NODE_ENV!=="development"||process.env.RELAY_HEALTH_PREVIEW!=="true")notFound();return <HealthPreview/>;}
