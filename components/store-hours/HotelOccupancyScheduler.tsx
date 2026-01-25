"use client";

interface HotelOccupancySchedulerProps {
  startDate: string;
  endDate: string;
  checkInTime: string;
  checkOutTime: string;
  onUpdate: (data: {
    startDate: string;
    endDate: string;
    checkInTime: string;
    checkOutTime: string;
  }) => void;
}

export default function HotelOccupancyScheduler({
  startDate,
  endDate,
  checkInTime,
  checkOutTime,
  onUpdate,
}: HotelOccupancySchedulerProps) {
  
  const handleChange = (field: string, value: any) => {
    onUpdate({
      startDate,
      endDate,
      checkInTime,
      checkOutTime,
      [field]: value,
    });
  };

  return (
    <div className="space-y-5">
      {/* Stay Dates */}
      <div>
        <label className="font-semibold block mb-2">Stay Dates</label>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-gray-600 block mb-1">Check-in Date</label>
            <input
              type="date"
              className="border rounded px-3 py-2 w-full"
              value={startDate}
              onChange={(e) => handleChange("startDate", e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm text-gray-600 block mb-1">Check-out Date</label>
            <input
              type="date"
              className="border rounded px-3 py-2 w-full"
              value={endDate}
              onChange={(e) => handleChange("endDate", e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Occupancy Times */}
      <div>
        <label className="font-semibold block mb-2">Occupancy Times</label>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-gray-600 block mb-1">Check-in Time</label>
            <input
              type="time"
              className="border rounded px-3 py-2 w-full"
              value={checkInTime}
              onChange={(e) => handleChange("checkInTime", e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm text-gray-600 block mb-1">Check-out Time</label>
            <input
              type="time"
              className="border rounded px-3 py-2 w-full"
              value={checkOutTime}
              onChange={(e) => handleChange("checkOutTime", e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Occupancy Summary */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm font-medium text-blue-900 mb-2">Room Occupancy:</p>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Check-in day: occupied from {checkInTime || "check-in time"} until end of day</li>
          <li>• Middle days: occupied all day (full 24 hours)</li>
          <li>• Check-out day: occupied from midnight until {checkOutTime || "check-out time"}</li>
        </ul>
      </div>
    </div>
  );
}
