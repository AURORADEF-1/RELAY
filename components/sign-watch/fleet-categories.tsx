"use client";
import Link from "next/link";
import {usePathname} from "next/navigation";
import './style.css';
export function FleetCategories(){const path=usePathname();return <nav className="sign-watch-categories" aria-label="Fleet categories"><Link href="/fleet/map" aria-current={path==='/fleet/map'?'page':undefined}>Fleet map</Link><Link href="/fleet/sign-watch" aria-current={path==='/fleet/sign-watch'?'page':undefined}>Sign Watch</Link><Link href="/fleet/register">Fleet register</Link></nav>;}
