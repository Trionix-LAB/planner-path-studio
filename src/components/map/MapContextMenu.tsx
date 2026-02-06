import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export interface ContextMenuItem {
    label: string;
    action: () => void;
    variant?: 'default' | 'destructive';
}

interface MapContextMenuProps {
    position: { x: number; y: number };
    items: ContextMenuItem[];
    onClose: () => void;
}

export const MapContextMenu = ({ position, items, onClose }: MapContextMenuProps) => {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                onClose();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [onClose]);

    return createPortal(
        <div
            ref={ref}
            className="fixed z-[9999] min-w-[160px] bg-popover text-popover-foreground rounded-md border border-border shadow-md p-1 animate-in fade-in zoom-in-95 duration-100"
            style={{ top: position.y, left: position.x }}
            onContextMenu={(e) => e.preventDefault()}
        >
            {items.map((item, index) => (
                <button
                    key={index}
                    className={`w-full text-left px-2 py-1.5 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground select-none outline-none cursor-default flex items-center ${item.variant === 'destructive' ? 'text-destructive focus:text-destructive' : ''
                        }`}
                    onClick={() => {
                        item.action();
                        onClose();
                    }}
                >
                    {item.label}
                </button>
            ))}
        </div>,
        document.body
    );
};
