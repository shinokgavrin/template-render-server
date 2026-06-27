import React from 'react';
import { 
	AbsoluteFill, 
	Audio, 
	Img, 
	Sequence, 
	Video, 
	Loop, 
	useCurrentFrame, 
	useVideoConfig 
} from 'remotion';

type Action = {
	type: string;
	start_time: number;
	end_time: number;
	url?: string;
	max_width?: number;
	max_height?: number;
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
				<h1 style={{ color: 'white', fontFamily: 'sans-serif', fontSize: '40px' }}>⚠️ ОШИБКА РЕНДЕРА: Отсутствует ссылка на видео</h1>
			</AbsoluteFill>
		);
	}

	const currentTime = frame / fps;
	
	const isMuted = actions?.some(
		(a) => (a.type === 'mute_title' || a.type === 'mute') && 
		currentTime >= a.start_time && 
		currentTime <= a.end_time
	) ?? false;

	return (
		<AbsoluteFill style={{ backgroundColor: 'black' }}>
			
			{/* === 1. ОСНОВНОЕ ВИДЕО (Фиксированный старт и скорость) === */}
			<AbsoluteFill>
				<Video 
					src={originalVideoUrl} 
					muted={true} 
					startFrom={0} // ← Заставляет браузер сразу начать с первого кадра
					playbackRate={1}
					style={{ width: '100%', height: '100%', objectFit: 'contain' }}
					crossOrigin="anonymous" 
				/>
			</AbsoluteFill>

			{/* === 2. ОРИГИНАЛЬНЫЙ ЗВУК === */}
			<Audio src={originalVideoUrl} volume={isMuted ? 0 : 1} />

			{/* === 3. НАЛОЖЕНИЯ И АУДИОДОРОЖКИ === */}
			{actions?.map((action, index) => {
				const startFrame = Math.round(action.start_time * fps);
				const durationInFrames = Math.max(1, Math.round((action.end_time - action.start_time) * fps));

				if ((action.type === 'overlay_image' || action.type === 'overlay_gif') && action.url) {
					const isVideoAsset = action.url.toLowerCase().endsWith('.mp4') || action.url.toLowerCase().endsWith('.webm');
					
					return (
						<Sequence key={index} from={startFrame} durationInFrames={durationInFrames}>
							<AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', pointerEvents: 'none' }}>
								{isVideoAsset ? (
									// ← Более легкая реализация для видео и gif-реакций
									<Loop durationInFrames={durationInFrames}>
										<Video 
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
									</Loop>
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
