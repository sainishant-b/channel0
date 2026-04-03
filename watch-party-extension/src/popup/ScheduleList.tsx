import { useState, useEffect } from 'react';
import type { Show } from '@shared/types';
import { formatTime, formatCountdown } from '@shared/time-utils';

interface ScheduleListProps {
  shows: Show[];
  onSetReminder: (show: Show) => void;
}

export function ScheduleList({ shows, onSetReminder }: ScheduleListProps) {
  if (shows.length === 0) {
    return null;
  }

  return (
    <section className="schedule-section">
      <h4 className="section-title">Coming Up</h4>
      <div className="schedule-list">
        {shows.slice(0, 3).map((show) => (
          <ScheduleItem 
            key={show.id} 
            show={show} 
            onSetReminder={() => onSetReminder(show)}
          />
        ))}
      </div>
    </section>
  );
}

interface ScheduleItemProps {
  show: Show;
  onSetReminder: () => void;
}

function ScheduleItem({ show, onSetReminder }: ScheduleItemProps) {
  const [countdown, setCountdown] = useState('');
  const time = formatTime(show.startTime);
  const durationMinutes = Math.round(show.duration / 60);

  useEffect(() => {
    const updateCountdown = () => {
      setCountdown(formatCountdown(show.startTime));
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [show.startTime]);

  return (
    <div className="schedule-item">
      <div className="schedule-time">
        <span className="time">{time}</span>
        <span className="countdown">{countdown}</span>
      </div>
      <div className="schedule-info">
        <span className="schedule-title">{show.title}</span>
        <span className="schedule-duration">{durationMinutes} min</span>
      </div>
      <button className="remind-btn" onClick={onSetReminder} title="Set reminder">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
        </svg>
      </button>
    </div>
  );
}
