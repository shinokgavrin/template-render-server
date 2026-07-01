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
                <OffthreadVideo src={src} style={style} crossOrigin="anonymous" />
            </AbsoluteFill>
        </Loop>
    );
};

// Unified Text Animation Engine
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

    let transform = '';
    let opacity = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: 'clamp' });

    if (animation === 'pop') {
        const scale = spring({ fps, frame, config: { damping: 12, mass: 0.7, stiffness: 130 } });
        transform = `scale(${scale})`;
    } else if (animation === 'slide') {
        const x = interpolate(frame, [0, 15], [position === 'left' ? -200 : position === 'right' ? 200 : 0, 0], { extrapolateRight: 'clamp' });
        const y = interpolate(frame, [0, 15], [position === 'center' ? 100 : 0, 0], { extrapolateRight: 'clamp' });
        transform = `translate(${x}px, ${y}px)`;
    } else if (animation === 'highlight') {
        const pulse = interpolate(frame, [0, 15, 30], [1, 1.05, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'baseline' });
        transform = `scale(${pulse})`;
    }

    const isHeroTitle = type === 'title';
    const cardStyle: React.CSSProperties = {
        transform,
        opacity,
        backgroundColor: isHeroTitle ? 'transparent' : 'rgba(15, 23, 42, 0.88)',
        padding: isHeroTitle ? '20px' : '50px 70px',
        borderRadius: '32px',
        maxWidth: position === 'center' ? '85%' : '65%',
        color: 'white',
        border: isHeroTitle ? 'none' : '2px solid rgba(255,255,255,0.1)',
        backdropFilter: isHeroTitle ? 'none' : 'blur(20px)',
        textAlign: position === 'center' ? 'center' : 'left',
        boxShadow: isHeroTitle ? 'none' : '0 30px 60px rgba(0,0,0,0.6)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: position === 'center' ? 'center' : 'flex-start',
    };

    let displayedText = text;
    if (animation === 'typewriter') {
        const progress = Math.floor(interpolate(frame, [0, Math.min(45, text.length * 1.5)], [0, text.length], { extrapolateRight: 'clamp' }));
        displayedText = text.slice(0, progress);
    }

    // Advanced Flexbox Alignment Structure 
    const justify = position === 'center' ? 'center' : position === 'left' ? 'flex-start' : 'flex-end';
    const align = 'center';
    const paddingSide = position === 'left' ? '100px' : position === 'right' ? '100px' : '0px';

    return (
        <AbsoluteFill style={{ 
            display: 'flex', 
            flexDirection: 'row',
            justifyContent: justify, 
            alignItems: align, 
            paddingLeft: paddingSide,
            paddingRight: paddingSide,
            pointerEvents: 'none' 
        }}>
            <div style={cardStyle}>
                {type === 'quote' && <div style={{ fontSize: '90px', color: '#38bdf8', marginBottom: '-30px', lineHeight: 1, fontFamily: 'sans-serif' }}>"</div>}
                
                <div style={{ 
                    fontSize: type === 'title' ? '110px' : type === 'number' ? '150px' : '48px', 
                    fontWeight: '900', 
                    lineHeight: 1.3, 
                    fontFamily: 'sans-serif',
                    color: type === 'number' || type === 'title' ? color : 'white',
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
                        fontStyle: type === 'quote' ? 'italic' : 'normal',
                        opacity: interpolate(frame, [10, 25], [0, 1], { extrapolateRight: 'clamp' })
                    }}>
                        {type === 'quote' ? `— ${subtext}` : subtext}
                    </div>
                )}
            </div>
        </AbsoluteFill>
    );
};

// Precise Volume Interpolation Engine
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
            {/* Base Presenter Video Layer */}
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

                // Bulletproof Unique Tracking Key
                const uniqueKey = `${action.type}-${index}-${startFrame}-${action.url?.split('/').pop()?.slice(0, 20) || 'no-url'}`;

                // 1. Graphical Media Components (Images, GIFs, Loop Reactions)
                if ((action.type === 'overlay_image' || action.type === 'overlay_gif') && action.url) {
                    const isVideoAsset = action.url.toLowerCase().endsWith('.mp4') || action.url.toLowerCase().endsWith('.webm');
                    
                    const widthPct = action.max_width ? `${action.max_width}%` : '70%';
                    const heightPct = action.max_height ? `${action.max_height}%` : '70%';
                    const soundVol = action.transition_volume !== undefined ? action.transition_volume : 1;

                    return (
                        <Sequence key={uniqueKey} from={startFrame} durationInFrames={durationInFrames}>
                            {action.transition_sound && (
                                <Audio src={action.transition_sound} volume={soundVol} startFrom={0} endAt={Math.min(fps * 2, durationInFrames)} />
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

                // 2. Advanced Kinetic Text Overlays
                if (['overlay_quote', 'overlay_number', 'overlay_title', 'overlay_text'].includes(action.type) && action.title) {
                    const cleanType = action.type.replace('overlay_', '') as 'quote' | 'number' | 'title' | 'text';
                    const soundVol = action.transition_volume !== undefined ? action.transition_volume : 1;
                    
                    return (
                        <Sequence key={uniqueKey} from={startFrame} durationInFrames={durationInFrames}>
                            {action.transition_sound && (
                                <Audio src={action.transition_sound} volume={soundVol} startFrom={0} endAt={Math.min(fps * 2, durationInFrames)} />
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

                // 3. Automated Segment Audio Injection
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
