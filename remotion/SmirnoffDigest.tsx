import React, { useEffect, useState } from 'react';
import { 
    AbsoluteFill, 
    Audio, 
    Img, 
    Sequence, 
    Video, 
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
    animation?: 'pop' | 'slide' | 'fade' | 'typewriter' | 'highlight';
    position?: 'center' | 'left' | 'right';
    color?: string;
    transition_sound?: string;
    transition_volume?: number;
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
            <AbsoluteFill style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', pointerEvents: 'none' }}>
                <Video 
                    src={src} 
                    style={style} 
                    muted={true} 
                    loop={true}
                    crossOrigin="anonymous" 
                />
            </AbsoluteFill>
        </Loop>
    );
};

const AnimatedTextOverlay: React.FC<{
    text: string;
    subtext?: string;
    type: 'quote' | 'number' | 'title' | 'text';
    animation?: 'pop' | 'slide' | 'fade' | 'typewriter' | 'highlight';
    position?: 'center' | 'left' | 'right';
    color?: string;
}> = ({ text, subtext, type, animation = 'pop', position = 'center', color = '#38bdf8' }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    const opacity = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: 'clamp' });
    const scale = spring({ fps, frame, config: { damping: 12, mass: 0.7, stiffness: 130 } });
    
    const slideX = interpolate(frame, [0, 15], [position === 'left' ? -200 : position === 'right' ? 200 : 0, 0], { extrapolateRight: 'clamp' });
    const slideY = interpolate(frame, [0, 15], [position === 'center' ? 100 : 0, 0], { extrapolateRight: 'clamp' });

    let transform = `scale(${scale})`;
    if (animation === 'slide') {
        transform = `translate(${slideX}px, ${slideY}px)`;
    } else if (animation === 'fade' || animation === 'typewriter') {
        transform = 'scale(1)';
    } else if (animation === 'highlight') {
        const pulse = interpolate(frame, [0, 15, 30], [1, 1.05, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'baseline' });
        transform = `scale(${pulse})`;
    }

    const isNumber = type === 'number';
    const isQuote = type === 'quote';
    const isTitle = type === 'title';

    const cardStyle: React.CSSProperties = {
        transform,
        transformOrigin: position === 'left' ? 'left center' : position === 'right' ? 'right center' : 'center center',
        opacity,
        backgroundColor: isTitle ? 'transparent' : (isNumber ? 'rgba(0, 0, 0, 0.7)' : 'rgba(15, 23, 42, 0.88)'),
        padding: isTitle ? '20px' : (isNumber ? '50px 80px' : '60px 80px'),
        borderRadius: isNumber ? '40px' : '32px',
        border: isTitle ? 'none' : (isNumber ? '3px solid #38bdf8' : '2px solid rgba(255,255,255,0.1)'),
        backdropFilter: isTitle ? 'none' : 'blur(16px)',
        boxShadow: isTitle ? 'none' : (isNumber ? '0 0 50px rgba(56, 189, 248, 0.3)' : '0 30px 60px rgba(0,0,0,0.5)'),
        maxWidth: position === 'center' ? '85%' : '65%',
        color: 'white',
        textAlign: position === 'center' ? 'center' : 'left',
        display: 'flex',
        flexDirection: 'column',
        alignItems: position === 'center' ? 'center' : 'flex-start',
    };

    let displayedText = text;
    if (animation === 'typewriter') {
        const progress = Math.floor(interpolate(frame, [0, Math.min(45, text.length * 1.5)], [0, text.length], { extrapolateRight: 'clamp' }));
        displayedText = text.slice(0, progress);
    }

    const align = position === 'left' ? 'flex-start' : position === 'right' ? 'flex-end' : 'center';
    const paddingSide = position === 'left' ? '100px' : position === 'right' ? '100px' : '0px';

    return (
        <AbsoluteFill style={{ 
            display: 'flex', 
            flexDirection: 'column',
            justifyContent: 'center', 
            alignItems: align, 
            paddingLeft: paddingSide,
            paddingRight: paddingSide,
            pointerEvents: 'none' 
        }}>
            <div style={cardStyle}>
                {isQuote && <div style={{ fontSize: '90px', color: '#38bdf8', marginBottom: '-20px', lineHeight: 1, fontFamily: 'sans-serif' }}>"</div>}
                
                <div style={{ 
                    fontSize: isTitle ? '110px' : (isNumber ? '150px' : '48px'), 
                    fontWeight: '900', 
                    lineHeight: 1.3, 
                    fontFamily: 'sans-serif',
                    color: isNumber || isTitle ? color : 'white',
                    textShadow: '0 4px 30px rgba(0,0,0,0.8)'
                }}>
                    {displayedText}
                </div>
                
                {subtext && (
                    <div style={{ 
                        fontSize: '30px', 
                        color: '#94a3b8', 
                        marginTop: '24px', 
                        fontFamily: 'sans-serif', 
                        fontStyle: isQuote ? 'italic' : 'normal',
                        opacity: interpolate(frame, [10, 25], [0, 1], { extrapolateRight: 'clamp' })
                    }}>
                        {isQuote ? `— ${subtext}` : subtext}
                    </div>
                )}
            </div>
        </AbsoluteFill>
    );
};

const getCurrentVolume = (frame: number, fps: number, actions: Action[]) => {
    let volume = 1;
    if (!actions) return volume;

    for (const action of actions) {
        if (action.type === 'mute' || action.type === 'mute_title') {
            const startFrame = Math.round(action.start_time * fps);
            const endFrame = Math.round(action.end_time * fps);
            
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
    return Math.max(0.05, volume); 
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

    const currentVolume = getCurrentVolume(frame, fps, actions);

    return (
        <AbsoluteFill style={{ backgroundColor: 'black' }}>
            <AbsoluteFill style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <Video 
                    src={originalVideoUrl} 
                    muted={true}
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    crossOrigin="anonymous" 
                />
            </AbsoluteFill>

            <Audio src={originalVideoUrl} volume={currentVolume} />

            {actions?.map((action, index) => {
                const startFrame = Math.round(action.start_time * fps);
                const durationInFrames = Math.max(1, Math.round((action.end_time - action.start_time) * fps));

                const uniqueKey = `${action.type}-${index}-${startFrame}-${action.url?.split('/').pop()?.slice(0, 20) || 'no-url'}`;

                if ((action.type === 'overlay_image' || action.type === 'overlay_gif') && action.url) {
                    const isVideoAsset = action.url.toLowerCase().endsWith('.mp4') || action.url.toLowerCase().endsWith('.webm');
                    
                    // Умное разделение размеров: видео — крупно (85%), фото — аккуратно (70%)
                    const defaultSize = isVideoAsset ? '85%' : '70%';
                    const widthPct = action.max_width ? `${action.max_width}%` : defaultSize;
                    const heightPct = action.max_height ? `${action.max_height}%` : defaultSize;
                    const soundVol = action.transition_volume !== undefined ? action.transition_volume : 0.6;
                    const transitionSound = action.transition_sound || "https://pub-9133209d2ae746859bab1bf8500330d4.r2.dev/AUDIO/whoosh.mp3";

                    return (
                        <Sequence key={uniqueKey} from={startFrame} durationInFrames={durationInFrames}>
                            {transitionSound && (
                                <Audio src={transitionSound} volume={soundVol} startFrom={0} endAt={Math.min(fps * 2, durationInFrames)} />
                            )}
                            <AbsoluteFill style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', pointerEvents: 'none' }}>
                                {isVideoAsset ? (
                                    <LoopingReaction 
                                        src={action.url} 
                                        style={{ 
                                            width: widthPct,
                                            height: heightPct,
                                            objectFit: 'contain',
                                            borderRadius: '24px',
                                            boxShadow: '0 30px 60px rgba(0,0,0,0.8)' 
                                        }}
                                    />
                                ) : (
                                    <Img 
                                        src={action.url} 
                                        style={{ 
                                            width: widthPct,
                                            height: heightPct,
                                            objectFit: 'contain',
                                            borderRadius: '24px',
                                            boxShadow: '0 30px 60px rgba(0,0,0,0.8)' 
                                        }}
                                        crossOrigin="anonymous"
                                    />
                                )}
                            </AbsoluteFill>
                        </Sequence>
                    );
                }

                if (['overlay_quote', 'overlay_number', 'overlay_title', 'overlay_text'].includes(action.type) && action.title) {
                    const cleanType = action.type.replace('overlay_', '') as 'quote' | 'number' | 'title' | 'text';
                    const soundVol = action.transition_volume !== undefined ? action.transition_volume : 0.6;
                    const transitionSound = action.transition_sound || "https://pub-9133209d2ae746859bab1bf8500330d4.r2.dev/AUDIO/whoosh.mp3";
                    
                    return (
                        <Sequence key={uniqueKey} from={startFrame} durationInFrames={durationInFrames}>
                            {transitionSound && (
                                <Audio src={transitionSound} volume={soundVol} startFrom={0} endAt={Math.min(fps * 2, durationInFrames)} />
                            )}
                            <AnimatedTextOverlay 
                                text={action.title}
                                subtext={action.subtitle}
                                type={cleanType}
                                animation={action.animation || 'pop'}
                                position={action.position || 'center'}
                                color={action.color}
                            />
                        </Sequence>
                    );
                }

                if (action.type === 'mute_title' && action.url) {
                    return (
                        <Sequence key={uniqueKey} from={startFrame} durationInFrames={durationInFrames}>
                            <Audio src={action.url} volume={1} />
                        </Sequence>
                    );
                }

                return null;
            })}
        </AbsoluteFill>
    );
};
