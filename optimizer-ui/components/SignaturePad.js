'use client';

import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';

const SignaturePad = forwardRef(({ onSave, onClear }, ref) => {
    const canvasRef = useRef(null);
    const [isDrawing, setIsDrawing] = useState(false);

    useImperativeHandle(ref, () => ({
        getBase64: () => {
            return canvasRef.current.toDataURL();
        },
        clear: () => {
            const canvas = canvasRef.current;
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }));

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        const resize = () => {
            const rect = canvas.getBoundingClientRect();
            canvas.width = rect.width;
            canvas.height = rect.height;
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
        };

        window.addEventListener('resize', resize);
        resize();

        return () => window.removeEventListener('resize', resize);
    }, []);

    const getPos = (e) => {
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);
        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    };

    const start = (e) => {
        setIsDrawing(true);
        const pos = getPos(e);
        const ctx = canvasRef.current.getContext('2d');
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
    };

    const move = (e) => {
        if (!isDrawing) return;
        const pos = getPos(e);
        const ctx = canvasRef.current.getContext('2d');
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
    };

    const stop = () => setIsDrawing(false);

    const clear = () => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (onClear) onClear();
    };

    return (
        <div className="flex flex-col gap-2">
            <canvas
                ref={canvasRef}
                onMouseDown={start}
                onMouseMove={move}
                onMouseUp={stop}
                onMouseLeave={stop}
                onTouchStart={start}
                onTouchMove={move}
                onTouchEnd={stop}
                className="w-full h-40 bg-white border border-gray-300 rounded cursor-crosshair touch-none"
            />
            <button
                type="button"
                onClick={clear}
                className="text-[10px] uppercase font-bold text-gray-400 hover:text-gray-600 transition-colors self-end"
            >
                Clear Signature
            </button>
        </div>
    );
});

SignaturePad.displayName = 'SignaturePad';
export default SignaturePad;
