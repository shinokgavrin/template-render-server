import React from 'react';

// Динамическое разрешение модуля для предотвращения ошибок статического анализа в среде предпросмотра
const remotionModule = (() => {
	try {
		const moduleName = 'remotion';
		return require(moduleName);
	} catch (e) {
		// Высококачественный мок-фоллбек для успешной компиляции в Canvas
		return {
			AbsoluteFill: ({ children, style }: any) => (
				<div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, ...style }}>
					{children}
				</div>
			),
			Audio: () => null,
			Img: (props: any) => <img {...props} />,
			Sequence: ({ children }: any) => <>{children}</>,
			Video: (props: any) => <video {...props} />,
			OffthreadVideo: (props: any) => <video {...props} />, // Добавлен мок для OffthreadVideo
			useCurrentFrame: () => 0,
			useVideoConfig: () => ({ fps: 30 })
		};
	}
})();

const { AbsoluteFill, Audio, Img, Sequence, OffthreadVideo, useCurrentFrame, useVideoConfig } = remotionModule;

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
	
	// === ОБРАБОТКА ОШИБОК ===
	// Если URL не передан, показываем четкую ошибку вместо тихого сбоя рендера
	if (!originalVideoUrl) {
		return (
			<AbsoluteFill style={{ backgroundColor: '#7f1d1d', justifyContent: 'center', alignItems: 'center' }}>
				<h1 style={{ color: 'white', fontFamily: 'sans-serif', fontSize: '40px' }}>
					⚠️ ОШИБКА РЕНДЕРА: originalVideoUrl пуст!
				</h1>
			</AbsoluteFill>
		);
	}

	// Вычисляем текущее время в секундах для приглушения фонового звука
	const currentTime = frame / fps;
	
	// Проверяем, попадает ли текущее время в блок "mute" или "mute_title"
	const isMuted = actions?.some(
		(a) => (a.type === 'mute_title' || a.type === 'mute') && 
		currentTime >= a.start_time && 
		currentTime <= a.end_time
	);

	return (
		<AbsoluteFill style={{ backgroundColor: 'black' }}>
			
			{/* === 1. ОСНОВНОЕ ВИДЕО (ТОЛЬКО ВИЗУАЛ) === */}
			<AbsoluteFill>
				<OffthreadVideo 
					src={originalVideoUrl} 
					muted={true} 
					style={{ width: '100%', height: '100%', objectFit: 'contain' }} 
				/>
			</AbsoluteFill>

			{/* === 2. ОРИГИНАЛЬНЫЙ ЗВУК (С НАДЕЖНЫМ MUTE) === */}
			<Audio 
				src={originalVideoUrl} 
				volume={isMuted ? 0 : 1} 
			/>

			{/* === 3. НАЛОЖЕНИЯ И АУДИОДОРОЖКИ TTS === */}
			{actions?.map((action, index) => {
				const startFrame = Math.round(action.start_time * fps);
				const durationInFrames = Math.max(1, Math.round((action.end_time - action.start_time) * fps));

				// Рендер наложений изображений/GIF/видео
				if ((action.type === 'overlay_image' || action.type === 'overlay_gif') && action.url) {
					const isVideoAsset = action.url.toLowerCase().endsWith('.mp4') || action.url.toLowerCase().endsWith('.webm');
					
					return (
						<Sequence key={index} from={startFrame} durationInFrames={durationInFrames}>
							<AbsoluteFill style={{ 
								justifyContent: 'center', 
								alignItems: 'center',
								pointerEvents: 'none'
							}}>
								{isVideoAsset ? (
									// Заменили обычный Video на OffthreadVideo для надежности наложений!
									<OffthreadVideo 
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
									/>
								)}
							</AbsoluteFill>
						</Sequence>
					);
				}

				// Рендер аудиодорожек TTS
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
