"use client";

import { useEffect, useState, useCallback } from "react";
import { useOrg } from "@/context/OrgContext";
import { DailyHealthRow } from "@/lib/daily-health";
import TrustCalendar from "@/components/trust/TrustCalendar";
import TrustTrendChart from "@/components/trust/TrustTrendChart";
import RollingAverages from "@/components/trust/RollingAverages";
import TrustDayDetail from "@/components/trust/TrustDayDetail";
import TrustSiteDetail, { EquipmentItem, SpaceItem } from "@/components/trust/TrustSiteDetail";

interface RollingAvg {
  average: number;
  days_with_data: number;
  total_days: number;
  status: string;
}

interface SiteInfo {
  site_id: string;
  site_name: string;
}

function currentMonthStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default function TrustPage() {
  const { selectedOrgId } = useOrg();

  const [currentMonth, setCurrentMonth] = useState(currentMonthStr());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);

  const [monthRows, setMonthRows] = useState<DailyHealthRow[]>([]);
  const [trendRows, setTrendRows] = useState<DailyHealthRow[]>([]);
  const [rollingAverages, setRollingAverages] = useState<{
    "7": RollingAvg | null;
    "30": RollingAvg | null;
    "90": RollingAvg | null;
  }>({ "7": null, "30": null, "90": null });

  const [dayRows, setDayRows] = useState<DailyHealthRow[]>([]);
  const [daySites, setDaySites] = useState<SiteInfo[]>([]);

  const [siteRow, setSiteRow] = useState<DailyHealthRow | null>(null);
  const [siteEquipment, setSiteEquipment] = useState<EquipmentItem[]>([]);
  const [siteSpaces, setSiteSpaces] = useState<SpaceItem[]>([]);
  const [siteName, setSiteName] = useState("");

  const [loadingMonth, setLoadingMonth] = useState(false);
  const [loadingDay, setLoadingDay] = useState(false);
  const [loadingSite, setLoadingSite] = useState(false);

  const baseUrl = "/api/trust";

  // Fetch month data + rolling averages + trend
  const fetchMonthData = useCallback(async () => {
    if (!selectedOrgId) return;
    setLoadingMonth(true);

    const [monthRes, trendRes, avg7Res, avg30Res, avg90Res] = await Promise.all([
      fetch(`${baseUrl}?org_id=${selectedOrgId}&month=${currentMonth}`),
      fetch(`${baseUrl}?org_id=${selectedOrgId}&trend=30`),
      fetch(`${baseUrl}?org_id=${selectedOrgId}&range=7`),
      fetch(`${baseUrl}?org_id=${selectedOrgId}&range=30`),
      fetch(`${baseUrl}?org_id=${selectedOrgId}&range=90`),
    ]);

    const monthData = await monthRes.json();
    const trendData = await trendRes.json();
    const avg7 = await avg7Res.json();
    const avg30 = await avg30Res.json();
    const avg90 = await avg90Res.json();

    setMonthRows(monthData.rows || []);
    setTrendRows(trendData.rows || []);
    setRollingAverages({
      "7": avg7.error ? null : avg7,
      "30": avg30.error ? null : avg30,
      "90": avg90.error ? null : avg90,
    });

    setLoadingMonth(false);
  }, [selectedOrgId, currentMonth]);

  useEffect(() => {
    fetchMonthData();
  }, [fetchMonthData]);

  // Fetch day detail
  useEffect(() => {
    if (!selectedOrgId || !selectedDate) return;
    setLoadingDay(true);
    fetch(`${baseUrl}?org_id=${selectedOrgId}&date=${selectedDate}`)
      .then((r) => r.json())
      .then((data) => {
        setDayRows(data.rows || []);
        setDaySites(data.sites || []);
      })
      .finally(() => setLoadingDay(false));
  }, [selectedOrgId, selectedDate]);

  // Fetch site detail
  useEffect(() => {
    if (!selectedOrgId || !selectedSiteId || !selectedDate) return;
    setLoadingSite(true);
    fetch(`${baseUrl}?org_id=${selectedOrgId}&site_id=${selectedSiteId}&date=${selectedDate}`)
      .then((r) => r.json())
      .then((data) => {
        setSiteRow(data.row || null);
        setSiteEquipment(data.equipment || []);
        setSiteSpaces(data.spaces || []);
        // Find site name from day sites
        const site = daySites.find((s) => s.site_id === selectedSiteId);
        setSiteName(site?.site_name || selectedSiteId.slice(0, 8));
      })
      .finally(() => setLoadingSite(false));
  }, [selectedOrgId, selectedSiteId, selectedDate, daySites]);

  // SLA badge computed from monthRows
  const slaBreach = monthRows.some((r) => r.sla_breach);
  const slaWarning = monthRows.some((r) => r.sla_warning);

  const handleDayClick = (date: string) => {
    setSelectedSiteId(null);
    setSelectedDate(date === selectedDate ? null : date);
  };

  const handleSiteClick = (siteId: string) => {
    setSelectedSiteId(siteId);
  };

  const handleCloseDayDetail = () => {
    setSelectedDate(null);
    setSelectedSiteId(null);
  };

  const handleBackFromSite = () => {
    setSelectedSiteId(null);
  };

  if (!selectedOrgId) {
    return (
      <div className="p-6 text-center text-gray-400 text-sm">
        Select an organization to view the Trust Dashboard.
      </div>
    );
  }

  const hasData = monthRows.length > 0 || trendRows.length > 0;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Title */}
      <div className="text-center mb-6">
        <h1 className="text-4xl font-extrabold bg-gradient-to-r from-[#00a859] to-[#e0b53f] bg-clip-text text-transparent mb-1 drop-shadow-[0_0_6px_rgba(224,181,63,0.45)]">
          Trust Dashboard
        </h1>
        <p className="text-gray-500 text-sm">System health and reliability tracking</p>
      </div>

      {/* SLA Badge + Rolling Averages */}
      <div className="mb-6 space-y-3">
        <div className="flex items-center justify-center gap-3">
          {hasData && (
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
              slaBreach ? "bg-red-100 text-red-700" :
              slaWarning ? "bg-yellow-100 text-yellow-700" :
              "bg-green-100 text-green-700"
            }`}>
              SLA: {slaBreach ? "Breach" : slaWarning ? "Warning" : "Healthy"}
            </span>
          )}
        </div>
        <RollingAverages averages={rollingAverages} />
      </div>

      {loadingMonth ? (
        <div className="text-center text-sm text-gray-400 py-12">Loading health data...</div>
      ) : !hasData ? (
        <div className="text-center py-16">
          <div className="text-gray-300 text-5xl mb-4">&#128154;</div>
          <h2 className="text-lg font-semibold text-gray-500">No health data yet</h2>
          <p className="text-sm text-gray-400 mt-1">
            Health data will populate as the cron system runs and monitors your sites.
          </p>
        </div>
      ) : (
        <>
          {/* Calendar + Trend chart grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <TrustCalendar
              month={currentMonth}
              rows={monthRows}
              onDayClick={handleDayClick}
              selectedDate={selectedDate}
              onMonthChange={setCurrentMonth}
            />
            <TrustTrendChart rows={trendRows} />
          </div>

          {/* Day detail */}
          {selectedDate && (
            <div>
              {loadingDay ? (
                <div className="text-center text-sm text-gray-400 py-4">Loading day detail...</div>
              ) : (
                <TrustDayDetail
                  date={selectedDate}
                  rows={dayRows}
                  sites={daySites}
                  onSiteClick={handleSiteClick}
                  onClose={handleCloseDayDetail}
                />
              )}
            </div>
          )}

          {/* Site detail modal */}
          {selectedSiteId && !loadingSite && (
            <TrustSiteDetail
              siteName={siteName}
              date={selectedDate!}
              row={siteRow}
              equipment={siteEquipment}
              spaces={siteSpaces}
              onBack={handleBackFromSite}
            />
          )}
        </>
      )}
    </div>
  );
}
