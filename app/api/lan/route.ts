import { NextResponse } from 'next/server';
import { networkInterfaces } from 'os';

export async function GET() {
  const nets = networkInterfaces();
  const addresses: string[] = [];

  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      // Skip internal (loopback) addresses and IPv6
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push(net.address);
      }
    }
  }

  // Sort to prefer common LAN addresses first
  addresses.sort((a, b) => {
    const isLanA = a.startsWith('192.168.') || a.startsWith('10.') || 
                   /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(a);
    const isLanB = b.startsWith('192.168.') || b.startsWith('10.') || 
                   /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(b);
    
    if (isLanA && !isLanB) return -1;
    if (!isLanA && isLanB) return 1;
    return 0;
  });

  return NextResponse.json({ addresses });
}
