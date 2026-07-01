import React, { useEffect, useState } from 'react';
import { 
    AbsoluteFill, 
    Audio, 
    Img, 
    Sequence, 
    Video, 
    OffthreadVideo, 
    Loop, 
    useCurrentFrame, 
    useVideoConfig,
    delayRender,
    continueRender,
    interpolate,
    spring
} from 'remotion';
import { getVideoMetadata } from '@remotion/media-utils';

type Action = {
    type: string;
    start_time: number;
    end_time: number;
    url?: string;
    max_width?: number;
    max_height?: number;
    title?: string;
    subtitle?: string;
};

// Утилита для безопасного перевода абсолютных пикселей или процентов в валидный CSS
const getMaxDimension = (val: number | undefined, fallback: string): string => {
    if (!val) return fallback;
    if (val <= 100) return `${val}%`; // Если ИИ передал проценты (например, 70)
    return `${val}px`; // Если ИИ передал пиксели (например, 1080)
};

// Функция точного контроля громкости (устраняет перекрытия и щелчки кодека)
const getCurrentVolume = (frame: number, fps: number, actions: Action[]) => {
    let volume = 1;
    
    for (const action of actions) {
        if (action.type === 'mute' || action.type === 'mute_title') {
            const startFrame = Math.round(action.start_time * fps);
            const endFrame = Math.round(action.end_time * fps);
            
            // Плавное затухание за 5 кадров до старта и плавный возврат за 5 кадров после окончания
            if (frame >= startFrame - 5 && frame <= endFrame + 5) {
                const fadeOut = interpolate(frame, [startFrame - 5, startFrame], [1, 0], { 
                    extrapolateLeft: 'clamp', 
                    extrapolateRight: 'clamp' 
                });
                const fadeIn = interpolate(frame, [endFrame, endFrame + 5], [0, 1], { 
                    extrapolateLeft: 'clamp', 
                    extrapolateRight: 'clamp' 
                });
                
                volume = Math.min(volume, Math.min(fadeOut, fadeIn));
            }
        }
    }
    // Math.max(0.02, volume) защищает аудио-драйвер от клиппинга и щелчков при нулевой громкости
    return Math.max(0.02, volume); 
};

const LoopingReaction: React.FC<{ src: string; style: React.CSSProperties }> = ({ src, style }) => {
    const { fps } = useVideoConfig();
    const [handle] = useState(() => delayRender(`Fetching metadata for ${src}`));
    const [naturalDuration, setNaturalDuration] = useState<number | null>(null);

    useEffect(() => {
        const timeout = setTimeout(() => {
            setNaturalDuration(Math.round(fps * 5));
            continueRender(handle);
        }, 5000);

        getVideoMetadata(src)
            .then((meta) => {
                clearTimeout(timeout);
                const duration = Math.max(1, Math.round(meta.durationInSeconds * fps));
                setNaturalDuration(duration);
                continueRender(handle);
            })
            .catch(() => {
                clearTimeout(timeout);
                setNaturalDuration(Math.round(fps * 5));
                continueRender(handle);
            });
    }, [src, fps, handle]);

    if (naturalDuration === null) return null;

    return (
        <Loop durationInFrames={naturalDuration}>
            {/* 🔥 КРИТИЧЕСКИЙ ФИКС ЦЕНТРИРОВАНИЯ: Обертка в AbsoluteFill внутри цикла Loop */}
            <AbsoluteFill style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', pointerEvents: 'none' }}>
                <OffthreadVideo src={src} style={style} crossOrigin="anonymous" />
            </AbsoluteFill>
        </Loop>
    );
};

// Цитаты (СЛЕВА)
const AnimatedQuote: React.FC<{ text: string; author?: string }> = ({ text, author }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    
    const scale = spring({ fps, frame, config: { damping: 14, mass: 0.8 } });
    const opacity = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: 'clamp' });

    return (
        <AbsoluteFill style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingLeft: '100px', pointerEvents: 'none' }}>
            <div style={{ 
                transform: `scale(${scale})`, 
                transformOrigin: 'left center',
                opacity, 
                backgroundColor: 'rgba(15, 23, 42, 0.9)', 
                padding: '60px 80px', 
                borderRadius: '32px', 
                maxWidth: '65%', 
                color: 'white', 
                border: '2px solid rgba(255,255,255,0.1)', 
                backdropFilter: 'blur(16px)', 
                textAlign: 'left',
                boxShadow: '0 30px 60px rgba(0,0,0,0.5)'
            }}>
                <div style={{ fontSize: '80px', color: '#38bdf8', marginBottom: '-20px', lineHeight: 1 }}>"</div>
                <div style={{ fontSize: '46px', fontWeight: 'bold', lineHeight: 1.4, fontFamily: 'sans-serif' }}>{text}</div>
                {author && <div style={{ fontSize: '28px', color: '#94a3b8', marginTop: '30px', fontFamily: 'sans-serif', fontStyle: 'italic' }}>— {author}</div>}
            </div>
        </AbsoluteFill>
    );
};

// Цифры (СЛЕВА)
const AnimatedNumber: React.FC<{ number: string; label?: string }> = ({ number, label }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    
    const scale = spring({ fps, frame, config: { damping: 10, mass: 1, stiffness: 120 } });
    const opacity = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: 'clamp' });

    return (
        <AbsoluteFill style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingLeft: '100px', pointerEvents: 'none' }}>
            <div style={{ 
                transform: `scale(${scale})`, 
                transformOrigin: 'left center',
                opacity, 
                backgroundColor: 'rgba(0, 0, 0, 0.75)', 
                padding: '50px 80px', 
                borderRadius: '40px', 
                color: 'white', 
                border: '3px solid #38bdf8', 
                backdropFilter: 'blur(12px)', 
                textAlign: 'left',
                boxShadow: '0 0 50px rgba(56, 189, 248, 0.3)'
            }}>
                <div style={{ fontSize: '140px', fontWeight: '900', color: '#38bdf8', textShadow: '0 0 30px rgba(56, 189, 248, 0.6)', fontFamily: 'sans-serif', lineHeight: 1 }}>
                    {number}
                </div>
                {label && <div style={{ fontSize: '36px', color: '#f1f5f9', marginTop: '10px', textTransform: 'uppercase', letterSpacing: '4px', fontWeight: 'bold', fontFamily: 'sans-serif' }}>
                    {label}
                </div>}
            </div>
        </AbsoluteFill>
    );
};

export const SmirnoffDigest: React.FC<{
    originalVideoUrl: string;
    actions: Action[];
}> = ({ originalVideoUrl, actions }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    
    if (!originalVideoUrl) {
        return (
            <AbsoluteFill style={{ backgroundColor: '#7f1d1d', justifyContent: 'center', alignItems: 'center' }}>
                <h1 style={{ color: 'white', fontFamily: 'sans-serif', fontSize: '32px' }}>⚠️ ОШИБКА: Missing video URL</h1>
            </AbsoluteFill>
        );
    }

    // Вычисляем громкость через новую точную функцию
    const currentVolume = getCurrentVolume(frame, fps, actions);

    return (
        <AbsoluteFill style={{ backgroundColor: 'black' }}>
            {/* === ФОНОВОЕ ВИДЕО ДИКТОРA === */}
            <AbsoluteFill style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <Video 
                    src={originalVideoUrl} 
                    muted={true}
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    crossOrigin="anonymous" 
                />
            </AbsoluteFill>

            {/* === ОРИГИНАЛЬНЫЙ ЗВУК ДИКТОРA С ДИНАМИЧЕСКИМ ПРИГЛУШЕНИЕМ === */}
            <Audio src={originalVideoUrl} volume={currentVolume} />

            {/* === НАЛОЖЕНИЯ (OVERLAYS) === */}
            {actions?.map((action, index) => {
                const startFrame = Math.round(action.start_time * fps);
                const durationInFrames = Math.max(1, Math.round((action.end_time - action.start_time) * fps));

                if ((action.type === 'overlay_image' || action.type === 'overlay_gif') && action.url) {
                    const isVideoAsset = action.url.toLowerCase().endsWith('.mp4') || action.url.toLowerCase().endsWith('.webm');
                    
                    // Динамическая адаптация стилей под параметры max_width / max_height из n8n
                    const overlayStyle: React.CSSProperties = {
                        maxWidth: getMaxDimension(action.max_width, '70%'),
                        maxHeight: getMaxDimension(action.max_height, '70%'),
                        width: 'auto',
                        height: 'auto',
                        objectFit: 'contain',
                        borderRadius: '24px',
                        boxShadow: '0 30px 60px rgba(0,0,0,0.8)'
                    };

                    return (
                        <Sequence key={`action-${index}-${action.start_time}`} from={startFrame} durationInFrames={durationInFrames}>
                            {/* Контейнер выравнивания */}
                            <AbsoluteFill style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', pointerEvents: 'none' }}>
                                {isVideoAsset ? (
                                    <LoopingReaction 
                                        src={action.url} 
                                        style={overlayStyle}
                                    />
                                ) : (
                                    <Img 
                                        src={action.url} 
                                        style={overlayStyle}
                                        crossOrigin="anonymous"
                                    />
                                )}
                            </AbsoluteFill>
                        </Sequence>
                    );
                }

                if (action.type === 'overlay_quote' && action.title) {
                    return (
                        <Sequence key={`quote-${index}`} from={startFrame} durationInFrames={durationInFrames}>
                            <AnimatedQuote text={action.title} author={action.subtitle} />
                        </Sequence>
                    );
                }

                if (action.type === 'overlay_number' && action.title) {
                    return (
                        <Sequence key={`number-${index}`} from={startFrame} durationInFrames={durationInFrames}>
                            <AnimatedNumber number={action.title} label={action.subtitle} />
                        </Sequence>
                    );
                }

                if (action.type === 'mute_title' && action.url) {
                    return (
                        <Sequence key={`audio-${index}`} from={startFrame} durationInFrames={durationInFrames}>
                            <Audio src={action.url} volume={1} />
                        </Sequence>
                    );
                }

                return null;
            })}
        </AbsoluteFill>
    );
};
