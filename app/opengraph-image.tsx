import { ImageResponse } from 'next/og';

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          background: 'linear-gradient(120deg, #0b1324 0%, #14213d 55%, #1d3557 100%)',
          color: '#f8fafc',
          padding: '64px',
          justifyContent: 'space-between',
          alignItems: 'stretch',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', maxWidth: '72%' }}>
          <div style={{ fontSize: 28, opacity: 0.9 }}>Postfly</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 68, lineHeight: 1.06, fontWeight: 700 }}>Planuj posty na Facebooka, Instagram i LinkedIn</div>
            <div style={{ fontSize: 32, color: '#cbd5e1' }}>
              Opisy AI dla każdej platformy · TikTok i YouTube wkrótce
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            {['7 dni PRO bez karty', 'Propozycje opisów AI', 'Ceny w złotówkach'].map((pill) => (
              <div
                key={pill}
                style={{
                  border: '1px solid rgba(203, 213, 225, 0.35)',
                  borderRadius: 999,
                  padding: '8px 14px',
                  fontSize: 20,
                  color: '#e2e8f0',
                }}
              >
                {pill}
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 210,
            borderRadius: 28,
            border: '1px solid rgba(251, 191, 36, 0.35)',
            background: 'rgba(251, 191, 36, 0.12)',
            fontSize: 26,
            fontWeight: 600,
            color: '#fde68a',
          }}
        >
          Postfly
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}
