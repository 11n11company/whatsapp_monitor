import React from 'react';
import {
  CheckCheck,
  FileText,
  Image as ImageIcon,
  Video as VideoIcon,
  Music,
  MapPin,
  User,
  Download,
  AlertCircle,
  Smile,
} from 'lucide-react';
import { mediaAPI } from '../../services/api';

export default function MessageBubble({ message, repName, customerName, onOpenMedia }) {
  const isOutgoing = message.direction === 'outgoing';
  const type = (message.message_type || 'text').toLowerCase();
  const hasMedia = Boolean(message.media_id);

  // Formatted time (e.g. 2:15 PM)
  const formattedTime = message.message_timestamp
    ? new Date(message.message_timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  return (
    <div className={`flex w-full ${isOutgoing ? 'justify-end' : 'justify-start'} animate-fadeIn`}>
      <div
        className={`max-w-[85%] sm:max-w-[70%] md:max-w-[65%] rounded-xl px-3.5 py-2.5 shadow-2xs text-xs relative ${
          isOutgoing
            ? 'bg-[#D9FDD3] text-gray-900 rounded-tr-none border border-emerald-100/60'
            : 'bg-white text-gray-900 rounded-tl-none border border-gray-200/70'
        }`}
      >
        {/* Sender identification label */}
        <div className="flex items-center justify-between gap-3 text-[10px] font-bold mb-1">
          <span className={isOutgoing ? 'text-emerald-800' : 'text-blue-800'}>
            {isOutgoing ? (repName || 'Sales Representative') : (message.participant_name || customerName || 'Customer')}
          </span>

          {type !== 'text' && (
            <span className="uppercase text-[9px] bg-black/5 px-1.5 py-0.5 rounded font-mono text-gray-600">
              {type}
            </span>
          )}
        </div>

        {/* Message Content by Type */}
        {type === 'text' && (
          <p className="leading-relaxed whitespace-pre-wrap text-gray-900 break-words">
            {message.message_text || ''}
          </p>
        )}

        {type === 'image' && (
          <div className="space-y-1.5">
            {hasMedia ? (
              <div
                onClick={() =>
                  onOpenMedia &&
                  onOpenMedia({
                    mediaId: message.media_id,
                    fileName: message.media_file_name || 'image.jpg',
                    mimeType: message.media_mime_type || 'image/jpeg',
                  })
                }
                className="relative cursor-pointer group rounded-lg overflow-hidden border border-gray-200 bg-gray-100 max-h-56 flex items-center justify-center"
              >
                <img
                  src={mediaAPI.getUrl(message.media_id)}
                  alt="WhatsApp Image Attachment"
                  className="w-full h-auto object-cover group-hover:scale-102 transition-transform duration-200"
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.nextSibling.style.display = 'flex';
                  }}
                />
                <div className="hidden flex-col items-center justify-center p-6 text-gray-400 gap-1">
                  <ImageIcon className="w-8 h-8" />
                  <span className="text-[10px]">Click to view image</span>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-black/5 rounded-lg flex items-center gap-2 text-gray-600 text-[11px]">
                <ImageIcon className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>[Image Attachment]</span>
              </div>
            )}
            {message.message_text && message.message_text !== '[Image Attachment]' && (
              <p className="leading-relaxed text-gray-900 break-words">{message.message_text}</p>
            )}
          </div>
        )}

        {type === 'video' && (
          <div className="space-y-1.5">
            {hasMedia ? (
              <video
                src={mediaAPI.getUrl(message.media_id)}
                controls
                className="w-full max-h-56 rounded-lg bg-black object-contain shadow-xs"
              />
            ) : (
              <div className="p-3 bg-black/5 rounded-lg flex items-center gap-2 text-gray-600 text-[11px]">
                <VideoIcon className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>[Video Attachment]</span>
              </div>
            )}
            {message.message_text && message.message_text !== '[Video Attachment]' && (
              <p className="leading-relaxed text-gray-900 break-words">{message.message_text}</p>
            )}
          </div>
        )}

        {type === 'audio' && (
          <div className="space-y-1">
            {hasMedia ? (
              <div className="p-2 bg-white/70 rounded-lg border border-gray-200 flex flex-col gap-1">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-600">
                  <Music className="w-3.5 h-3.5 text-[#075E54]" />
                  <span>Voice / Audio Note</span>
                </div>
                <audio src={mediaAPI.getUrl(message.media_id)} controls className="w-full h-8" />
              </div>
            ) : (
              <div className="p-2.5 bg-black/5 rounded-lg flex items-center gap-2 text-gray-700">
                <Music className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>Voice / Audio Message</span>
              </div>
            )}
          </div>
        )}

        {type === 'document' && (
          <div className="p-2.5 bg-white/80 rounded-lg border border-gray-200 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 truncate">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-[#075E54] flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4" />
              </div>
              <div className="truncate">
                <div className="font-semibold truncate text-gray-900">
                  {message.media_file_name || message.message_text || 'Document.pdf'}
                </div>
                <div className="text-[10px] text-gray-400 font-mono">
                  {message.media_mime_type || 'PDF Document'}
                </div>
              </div>
            </div>

            {hasMedia && (
              <button
                type="button"
                onClick={() =>
                  onOpenMedia &&
                  onOpenMedia({
                    mediaId: message.media_id,
                    fileName: message.media_file_name || 'document',
                    mimeType: message.media_mime_type || 'application/octet-stream',
                  })
                }
                className="p-1.5 rounded-md hover:bg-gray-100 text-[#075E54] transition-colors cursor-pointer shrink-0"
                title="Open document"
              >
                <Download className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {type === 'contact' && (
          <div className="p-3 bg-white/80 rounded-lg border border-gray-200 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
              <User className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-gray-900">{message.message_text || 'Contact Card'}</div>
              <div className="text-[10px] text-gray-400">Shared Contact</div>
            </div>
          </div>
        )}

        {type === 'location' && (
          <div className="p-3 bg-white/80 rounded-lg border border-gray-200 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-rose-50 text-rose-700 flex items-center justify-center shrink-0">
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <div className="font-semibold text-gray-900">{message.message_text || 'Location Pin'}</div>
              <div className="text-[10px] text-gray-400">GPS Coordinates Shared</div>
            </div>
          </div>
        )}

        {type === 'reaction' && (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/5 text-gray-800 text-[11px] font-semibold">
            <Smile className="w-3.5 h-3.5 text-amber-500" />
            <span>Reacted {message.message_text}</span>
          </div>
        )}

        {/* Fallback for other / unsupported message types */}
        {!['text', 'image', 'video', 'audio', 'document', 'contact', 'location', 'reaction'].includes(type) && (
          <div className="p-2.5 bg-amber-50/70 border border-amber-200/80 rounded-lg flex items-center gap-2 text-amber-900 text-[11px]">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <div>
              <span className="font-bold uppercase tracking-wider text-[10px]">[{type} Message]</span>
              <p className="text-gray-600 mt-0.5">{message.message_text || 'Interactive or unsupported WhatsApp payload.'}</p>
            </div>
          </div>
        )}

        {/* Timestamp & read receipts */}
        <div className="flex items-center justify-end gap-1 text-[9px] text-gray-400 mt-1 select-none">
          <span>{formattedTime}</span>
          {isOutgoing && <CheckCheck className="w-3.5 h-3.5 text-blue-500" />}
        </div>
      </div>
    </div>
  );
}

