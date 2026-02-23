"use client";

import { Wifi, WifiOff, Activity, Thermometer, LayoutGrid } from "lucide-react";

interface Props {
  devices: { total: number; online: number };
  sensors: { total: number; mapped: number };
  zones: { total: number; managed: number };
  spaces: number;
  lastSync: string | null;
  haConnected: boolean;
}

export default function SiteHealthSummary({ devices, sensors, zones, spaces, lastSync, haConnected }: Props) {
  const syncAge = lastSync
    ? Math.floor((Date.now() - new Date(lastSync).getTime()) / 60000)
    : null;

  const syncLabel =
    syncAge === null ? "Never" :
    syncAge < 1 ? "Just now" :
    syncAge < 60 ? `${syncAge} min ago` :
    `${Math.floor(syncAge / 60)}h ago`;

  return (
    <div className="border rounded-lg bg-white shadow-sm p-4">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Site Health Summary</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-blue-500" />
          <div>
            <div className="text-sm font-semibold text-gray-800">{devices.online}/{devices.total}</div>
            <div className="text-[10px] text-gray-400">Devices online</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Thermometer className="w-4 h-4 text-green-500" />
          <div>
            <div className="text-sm font-semibold text-gray-800">{sensors.mapped}/{sensors.total}</div>
            <div className="text-[10px] text-gray-400">Sensors mapped</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <LayoutGrid className="w-4 h-4 text-purple-500" />
          <div>
            <div className="text-sm font-semibold text-gray-800">{zones.managed}/{zones.total}</div>
            <div className="text-[10px] text-gray-400">Zones managed</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <LayoutGrid className="w-4 h-4 text-orange-500" />
          <div>
            <div className="text-sm font-semibold text-gray-800">{spaces}</div>
            <div className="text-[10px] text-gray-400">Spaces</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-gray-400" />
          <div>
            <div className="text-sm font-semibold text-gray-800">{syncLabel}</div>
            <div className="text-[10px] text-gray-400">Last sync</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {haConnected ? (
            <Wifi className="w-4 h-4 text-green-500" />
          ) : (
            <WifiOff className="w-4 h-4 text-red-500" />
          )}
          <div>
            <div className={`text-sm font-semibold ${haConnected ? "text-green-600" : "text-red-500"}`}>
              {haConnected ? "Connected" : "Offline"}
            </div>
            <div className="text-[10px] text-gray-400">Home Assistant</div>
          </div>
        </div>
      </div>
    </div>
  );
}
