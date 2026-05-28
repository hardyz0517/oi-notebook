import { memo, useEffect, useRef, type ReactNode, type RefObject } from "react";
import { useVirtualMessageList, type VirtualMessageLike } from "@/components/ai/useVirtualMessageList";

type VirtualMessageListProps<T extends VirtualMessageLike> = {
  messages: T[];
  resetKey?: string;
  scrollRef: RefObject<HTMLDivElement | null>;
  className?: string;
  overscan?: number;
  renderVersion?: string | number;
  estimateSize?: (message: T) => number;
  renderMessage: (message: T, index: number) => ReactNode;
};

type MeasuredMessageRowProps = {
  id: string;
  onMeasure: (id: string, height: number) => void;
  children: ReactNode;
};

const MeasuredMessageRow = memo(function MeasuredMessageRow({
  id,
  onMeasure,
  children,
}: MeasuredMessageRowProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;

    const measure = () => {
      onMeasure(id, element.getBoundingClientRect().height);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [id, onMeasure]);

  return (
    <div ref={ref} data-virtual-message-id={id}>
      {children}
    </div>
  );
});

function VirtualMessageListInner<T extends VirtualMessageLike>({
  messages,
  resetKey,
  scrollRef,
  className,
  overscan,
  renderVersion: _renderVersion,
  estimateSize,
  renderMessage,
}: VirtualMessageListProps<T>) {
  const {
    bottomSpacerHeight,
    measureItem,
    topSpacerHeight,
    virtualItems,
  } = useVirtualMessageList({
    items: messages,
    resetKey,
    scrollRef,
    overscan,
    estimateSize,
  });

  return (
    <div className={className} data-virtual-message-list="true">
      <div style={{ height: topSpacerHeight }} aria-hidden="true" />
      {virtualItems.map(({ item, index }) => (
        <MeasuredMessageRow key={item.id} id={item.id} onMeasure={measureItem}>
          {renderMessage(item, index)}
        </MeasuredMessageRow>
      ))}
      <div style={{ height: bottomSpacerHeight }} aria-hidden="true" />
    </div>
  );
}

const areVirtualMessageListPropsEqual = <T extends VirtualMessageLike>(
  previous: VirtualMessageListProps<T>,
  next: VirtualMessageListProps<T>,
): boolean => (
  previous.messages === next.messages &&
  previous.resetKey === next.resetKey &&
  previous.scrollRef === next.scrollRef &&
  previous.className === next.className &&
  previous.overscan === next.overscan &&
  previous.renderVersion === next.renderVersion
);

export const VirtualMessageList = memo(VirtualMessageListInner, areVirtualMessageListPropsEqual) as typeof VirtualMessageListInner;
