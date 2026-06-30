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

// --- СТАБИЛЬНЫЕ РЕАКЦИИ С ТАЙМАУТОМ ---
const LoopingReaction: React.FC<{ src: string; style: React.CSSProperties }> = ({ src, style }) => {
	const { fps } = useVideoConfig();
	const [handle] = useState(() => delayRender(`Fetching metadata for ${src}`));
	const [naturalDuration, setNaturalDuration] = useState<number | null>(null);

	useEffect(() => {
		const timeout = setTimeout(() => {
			console.warn(`Metadata timeout for ${src}, using 5s fallback`);
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
			.catch((err) => {
				clearTimeout(timeout);
				console.warn("Could not get metadata for reaction", err);
				setNaturalDuration(Math.round(fps * 5));
				continueRender(handle);
			});
	}, [src, fps, handle]);

	if (naturalDuration === null) return null;

	return (
		<Loop durationInFrames={naturalDuration}>
			<OffthreadVideo src={src} style={style} crossOrigin="anonymous" />
		</Loop>
	);
};

const AnimatedQuote: React.FC<{ text: string; author?: string }> = ({ text, author }) => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	
	const scale = spring({ fps, frame, config: { damping: 14, mass: 0.8 } });
	const opacity = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: 'clamp' });

	return (
		<AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', pointerEvents: 'none' }}>
			<div style={{ 
				transform: `scale(${scale})`, 
				opacity, 
				backgroundColor: 'rgba(15, 23, 42, 0.85)', 
				padding: '60px 80px', 
				borderRadius: '32px', 
				maxWidth: '75%', 
				color: 'white', 
				border: '2px solid rgba(255,255,255,0.1)', 
				backdropFilter: 'blur(16px)', 
				textAlign: 'center',
				boxShadow: '0 30px 60px rgba(0,0,0,0.5)'
			}}>
				<div style={{ fontSize: '80px', color: '#38bdf8', marginBottom: '-20px', lineHeight: 1 }}>"</div>
				<div style={{ fontSize: '54px', fontWeight: 'bold', lineHeight: 1.4, fontFamily: 'sans-serif' }}>{text}</div>
				{author && <div style={{ fontSize: '28px', color: '#94a3b8', marginTop: '30px', fontFamily: 'sans-serif', fontStyle: 'italic' }}>— {author}</div>}
			</div>
		</AbsoluteFill>
	);
}

const AnimatedNumber: React.FC<{ number: string; label?: string }> = ({ number, label }) => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	
	const scale = spring({ fps, frame, config: { damping: 10, mass: 1, stiffness: 120 } });
	const opacity = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: 'clamp' });

	return (
		<AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', pointerEvents: 'none' }}>
			<div style={{ 
				transform: `scale(${scale})`, 
				opacity, 
				backgroundColor: 'rgba(0, 0, 0, 0.7)', 
				padding: '50px 100px', 
				borderRadius: '40px', 
				color: 'white', 
				border: '3px solid #38bdf8', 
				backdropFilter: 'blur(12px)', 
				textAlign: 'center',
				boxShadow: '0 0 50px rgba(56, 189, 248, 0.3)'
			}}>
				<div style={{ 
					fontSize: '140px', 
					fontWeight: '900', 
					color: '#38bdf8', 
					textShadow: '0 0 30px rgba(56, 189, 248, 0.6)',
					fontFamily: 'sans-serif',
					lineHeight: 1
				}}>
					{number}
				</div>
				{label && <div style={{ 
					fontSize: '36px', 
					color: '#f1f5f9', 
					marginTop: '20px', 
					textTransform: 'uppercase', 
					letterSpacing: '4px',
					fontWeight: 'bold',
					fontFamily: 'sans-serif'
				}}>
					{label}
				</div>}
			</div>
		</AbsoluteFill>
	);
}

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

	const currentVolume = actions?.reduce((acc, action) => {
		if (action.type === 'mute_title' || action.type === 'mute') {
			const startFrame = action.start_time * fps;
			const endFrame = action.end_time * fps;
			
			const fadeOut = interpolate(frame, [startFrame - 3, startFrame], [1, 0], { 
				extrapolateLeft: 'clamp', 
				extrapolateRight: 'clamp' 
			});
			
			const fadeIn = interpolate(frame, [endFrame, endFrame + 3], [0, 1], { 
				extrapolateLeft: 'clamp', 
				extrapolateRight: 'clamp' 
			});
			
			if (frame >= startFrame - 3 && frame <= endFrame + 3) {
				return Math.min(acc, Math.min(fadeOut, fadeIn));
			}
		}
		return acc;
	}, 1) ?? 1;

	return (
		<AbsoluteFill style={{ backgroundColor: 'black' }}>
			
			<AbsoluteFill>
				<Video 
					src={originalVideoUrl} 
					muted={true}
					style={{ width: '100%', height: '100%', objectFit: 'contain' }}
					crossOrigin="anonymous" 
				/>
			</AbsoluteFill>

			<Audio src={originalVideoUrl} volume={currentVolume} />

			{}
			{actions?.map((action, index) => {
				const startFrame = Math.round(action.start_time * fps);
				const durationInFrames = Math.max(1, Math.round((action.end_time - action.start_time) * fps));

				if ((action.type === 'overlay_image' || action.type === 'overlay_gif') && action.url) {
					const isVideoAsset = action.url.toLowerCase().endsWith('.mp4') || action.url.toLowerCase().endsWith('.webm');
					
					return (
						<Sequence key={index} from={startFrame} durationInFrames={durationInFrames}>
							<AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', pointerEvents: 'none' }}>
								{isVideoAsset ? (
									<LoopingReaction 
										src={action.url} 
										style={{ 
											maxWidth: action.max_width || 1080,
											maxHeight: action.max_height || 1350,
											objectFit: 'contain',
											borderRadius: '20px',
											boxShadow: '0 20px 40px rgba(0,0,0,0.6)' 
										}}
									/>
								) : (
									<Img 
										src={action.url} 
										style={{ 
											maxWidth: action.max_width || 1080,
											maxHeight: action.max_height || 1350,
											objectFit: 'contain',
											borderRadius: '20px',
											boxShadow: '0 20px 40px rgba(0,0,0,0.6)' 
										}}
										crossOrigin="anonymous"
									/>
								)}
							</AbsoluteFill>
						</Sequence>
					);
				}

				if (action.type === 'overlay_quote' && action.title) {
					return (
						<Sequence key={index} from={startFrame} durationInFrames={durationInFrames}>
							<AnimatedQuote text={action.title} author={action.subtitle} />
						</Sequence>
					);
				}

				if (action.type === 'overlay_number' && action.title) {
					return (
						<Sequence key={index} from={startFrame} durationInFrames={durationInFrames}>
							<AnimatedNumber number={action.title} label={action.subtitle} />
						</Sequence>
					);
				}

				if (action.type === 'mute_title' && action.url) {
					return (
						<Sequence key={index} from={startFrame} durationInFrames={durationInFrames}>
							<Audio src={action.url} volume={1} />
						</Sequence>
					);
				}

				return null;
			})}
		</AbsoluteFill>
	);
};
