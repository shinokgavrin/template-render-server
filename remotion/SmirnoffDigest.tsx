import React, { useEffect, useState } from 'react';
import { 
	AbsoluteFill, 
	Audio, 
	Img, 
	Sequence, 
	OffthreadVideo, 
	Video,
	Loop, 
	useCurrentFrame, 
	useVideoConfig,
	interpolate,
	spring,
	delayRender,
	continueRender
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

// 🔥 Смарт-компонент для ИДЕАЛЬНОГО ЗАЦИКЛИВАНИЯ видео-реакций
const LoopingReaction: React.FC<{ src: string; style: React.CSSProperties }> = ({ src, style }) => {
	const { fps } = useVideoConfig();
	const [handle] = useState(() => delayRender(`Fetching metadata for ${src}`));
	const [naturalDuration, setNaturalDuration] = useState<number | null>(null);

	useEffect(() => {
		const timeout = setTimeout(() => {
			setNaturalDuration(Math.round(fps * 3)); // фоллбэк 3 сек
			continueRender(handle);
		}, 5000);

		getVideoMetadata(src)
			.then((meta) => {
				clearTimeout(timeout);
				// Узнаем реальную длину видеореакции, чтобы цикл повторялся ровно по ней
				const duration = Math.max(1, Math.round(meta.durationInSeconds * fps));
				setNaturalDuration(duration);
				continueRender(handle);
			})
			.catch(() => {
				clearTimeout(timeout);
				setNaturalDuration(Math.round(fps * 3));
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

// Универсальный текстовый движок анимаций
const AnimatedTextOverlay: React.FC<{
	text: string;
	subtext?: string;
	type: 'quote' | 'number' | 'title' | 'text';
	animation?: 'pop' | 'slide' | 'fade' | 'typewriter' | 'highlight';
	position?: 'center' | 'left' | 'right';
	color?: string;
}> = ({ text, subtext, type, animation = 'pop', position = 'center' }) => {
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
	
	// Внешняя обертка нужна для тени, так как clip-path обрезает box-shadow
	const wrapperStyle: React.CSSProperties = {
		transform,
		opacity,
		maxWidth: position === 'center' ? '85%' : '75%', 
		filter: isHeroTitle ? 'none' : 'drop-shadow(0 25px 40px rgba(0,0,0,0.8))',
		display: 'flex',
		width: '100%',
		justifyContent: position === 'center' ? 'center' : position === 'left' ? 'flex-start' : 'flex-end',
	};

	// Внешний красный слой со скошенными углами
	const outerBoxStyle: React.CSSProperties = {
		backgroundColor: isHeroTitle ? 'transparent' : '#a81c1c', // Deep poster red
		padding: isHeroTitle ? '0' : '6px', // Ширина красного отступа до черной рамки
		clipPath: isHeroTitle ? 'none' : 'polygon(24px 0, calc(100% - 24px) 0, 100% 24px, 100% calc(100% - 24px), calc(100% - 24px) 100%, 24px 100%, 0 calc(100% - 24px), 0 24px)',
		width: isHeroTitle ? 'auto' : '100%',
	};

	// Внутренний слой с черной конструктивистской обводкой и параллельными углами
	const innerBoxStyle: React.CSSProperties = {
		backgroundColor: isHeroTitle ? 'transparent' : '#a81c1c', // Тот же красный фон
		border: isHeroTitle ? 'none' : '3px solid #000000', // Черная графичная рамка
		padding: isHeroTitle ? '20px' : '40px 60px',
		// Геометрия внутреннего среза чуть меньше (18px), чтобы рамка шла идеально параллельно внешнему слою
		clipPath: isHeroTitle ? 'none' : 'polygon(18px 0, calc(100% - 18px) 0, 100% 18px, 100% calc(100% - 18px), calc(100% - 18px) 100%, 18px 100%, 0 calc(100% - 18px), 0 18px)',
		display: 'flex',
		flexDirection: 'column',
		alignItems: position === 'center' ? 'center' : 'flex-start',
		textAlign: position === 'center' ? 'center' : 'left',
		width: '100%',
	};

	let displayedText = text;
	if (animation === 'typewriter') {
		const progress = Math.floor(interpolate(frame, [0, Math.min(45, text.length * 1.5)], [0, text.length], { extrapolateRight: 'clamp' }));
		displayedText = text.slice(0, progress);
	}

	const paddingSide = position === 'left' ? '80px' : position === 'right' ? '80px' : '0px';

	return (
		<AbsoluteFill style={{ 
			display: 'flex', 
			flexDirection: 'row',
			justifyContent: position === 'center' ? 'center' : position === 'left' ? 'flex-start' : 'flex-end',
			alignItems: 'center', 
			paddingLeft: paddingSide,
			paddingRight: paddingSide,
			pointerEvents: 'none' 
		}}>
			<div style={wrapperStyle}>
				<div style={outerBoxStyle}>
					<div style={innerBoxStyle}>
						{/* Белые кавычки */}
						{type === 'quote' && <div style={{ fontSize: '90px', color: 'white', marginBottom: '-30px', lineHeight: 1, fontFamily: 'sans-serif' }}>"</div>}
						
						{/* Чисто белый текст для максимального контраста */}
						<div style={{ 
							fontSize: type === 'title' ? '110px' : type === 'number' ? '150px' : '48px', 
							fontWeight: '900', 
							lineHeight: 1.3, 
							fontFamily: 'sans-serif',
							color: 'white', 
							textShadow: '0 3px 15px rgba(0,0,0,0.5)' // Мягкая черная тень для отрыва от фона
						}}>
							{displayedText}
						</div>
						
						{/* Белый подзаголовок (автор) */}
						{subtext && (
							<div style={{ 
								fontSize: '30px', 
								color: 'white', 
								marginTop: '24px', 
								fontFamily: 'sans-serif', 
								fontStyle: type === 'quote' ? 'italic' : 'normal',
								opacity: interpolate(frame, [10, 25], [0, 0.95], { extrapolateRight: 'clamp' })
							}}>
								{type === 'quote' ? `— ${subtext}` : subtext}
							</div>
						)}
					</div>
				</div>
			</div>
		</AbsoluteFill>
	);
};

// Функция плавного и точного микширования звука диктора
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
	return Math.max(0, volume);
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

	const currentVolume = getCurrentVolume(frame, fps, actions);

	return (
		<AbsoluteFill style={{ backgroundColor: 'black' }}>
			
			{/* === 1. ОСНОВНОЕ ВИДЕО === */}
			<AbsoluteFill style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
				<Video 
					src={originalVideoUrl} 
					muted={true}
					startFrom={0}
					playbackRate={1}
					style={{ width: '100%', height: '100%', objectFit: 'contain' }}
					crossOrigin="anonymous" 
				/>
			</AbsoluteFill>

			{/* === 2. ОРИГИНАЛЬНЫЙ ЗВУК С ПЛАВНЫМ ПРИГЛУШЕНИЕМ === */}
			<Audio src={originalVideoUrl} volume={currentVolume} />

			{/* === 3. НАЛОЖЕНИЯ И АУДИОДОРОЖКИ === */}
			{actions?.map((action, index) => {
				const startFrame = Math.round(action.start_time * fps);
				const durationInFrames = Math.max(1, Math.round((action.end_time - action.start_time) * fps));

				const uniqueKey = `${action.type}-${action.url?.split('/').pop() || ''}-${startFrame}-${index}`;

				// Графические оверлеи (Картинки и Видео)
				if ((action.type === 'overlay_image' || action.type === 'overlay_gif') && action.url) {
					const isVideoAsset = action.url.toLowerCase().endsWith('.mp4') || action.url.toLowerCase().endsWith('.webm');
					const soundVol = action.transition_volume !== undefined ? action.transition_volume : 1;
					
					return (
						<Sequence key={uniqueKey} from={startFrame} durationInFrames={durationInFrames}>
							{action.transition_sound && (
								<Audio src={action.transition_sound} volume={soundVol} startFrom={0} endAt={Math.min(fps * 2, durationInFrames)} />
							)}
							<AbsoluteFill style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', pointerEvents: 'none' }}>
								{isVideoAsset ? (
									// 🔥 Внедрен LoopingReaction для бесконечного проигрывания гифок
									<LoopingReaction 
										src={action.url} 
										style={{ 
											width: '70%',       
											height: '70%',      
											objectFit: 'contain',
											borderRadius: '20px',
											boxShadow: '0 20px 40px rgba(0,0,0,0.6)' 
										}}
									/>
								) : (
									<Img 
										src={action.url} 
										style={{ 
											width: '70%',           
											height: '70%',          
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

				// Текстовые оверлеи (Цитаты и Цифры)
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

				// Приглушение
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
