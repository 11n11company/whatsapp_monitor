import React from 'react';
import { X, Download, FileText, Image, Video, Music, AlertCircle } from 'lucide-react';
import { mediaAPI } from '../../services/api';

export default function MediaViewerModal({ isOpen, mediaId, fileName, mimeType, onClose }) {
  const [ticket, setTicket] = React.useState(null);
  const [loadError, setLoadError] = React.useState(false);

  React.useEffect(() => {
    if (!isOpen || !mediaId) {
      setTicket(null);
      setLoadError(false);
      return;
    }
    let isSubscribed = true;
    mediaAPI.getTicket(mediaId)
      .then((res) => {
        if (isSubscribed && res.ticket) {
          setTicket(res.ticket);
        }
      })
      .catch((err) => {
        console.warn('Could not acquire media ticket:', err.message);
      });
    return () => { isSubscribed = false; };
  }, [isOpen, mediaId]);

  if (!isOpen || !mediaId) return null;

  const mediaUrl = mediaAPI.getUrl(mediaId, ticket);
  const isImage = mimeType?.startsWith('image/');
  const isVideo = mimeType?.startsWith('video/');
  const isAudio = mimeType?.startsWith('audio/');
  const isPdfOrDoc = mimeType?.includes('pdf') || mimeType?.includes('document') || mimeType?.includes('sheet');

  const handleDownload = async () => {
    try {
      const blob = await mediaAPI.download(mediaId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName || `attachment_${mediaId}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download media file:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-3xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="h-14 px-4 sm:px-5 bg-[#075E54] text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 truncate min-w-0 mr-2">
            {isImage && <Image className="w-5 h-5 text-emerald-300 shrink-0" />}
            {isVideo && <Video className="w-5 h-5 text-emerald-300 shrink-0" />}
            {isAudio && <Music className="w-5 h-5 text-emerald-300 shrink-0" />}
            {!isImage && !isVideo && !isAudio && <FileText className="w-5 h-5 text-emerald-300 shrink-0" />}
            <span className="text-xs sm:text-sm font-semibold truncate">{fileName || 'Media Attachment'}</span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 active:bg-white/30 text-white text-xs font-semibold transition-colors cursor-pointer min-h-[40px] sm:min-h-[36px]"
              title="Download file"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Download</span>
            </button>
            <button
              onClick={onClose}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center -mr-2 rounded-lg hover:bg-white/10 text-emerald-100 hover:text-white transition-colors cursor-pointer"
              aria-label="Close media viewer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-3 sm:p-6 overflow-y-auto flex-1 flex flex-col items-center justify-center bg-gray-900/5 min-h-[260px]">
          {isImage ? (
            <img
              src={mediaUrl}
              alt={fileName || 'Image preview'}
              className="max-h-[65vh] max-w-full rounded-lg object-contain shadow-md"
              onError={(e) => {
                e.target.style.display = 'none';
                if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex';
              }}
            />
          ) : isVideo ? (
            <video
              src={mediaUrl}
              controls
              autoPlay
              playsInline
              className="max-h-[65vh] max-w-full rounded-lg shadow-md"
            >
              Your browser does not support HTML5 video streaming.
            </video>
          ) : isAudio ? (
            <div className="w-full max-w-md p-4 sm:p-6 bg-white rounded-xl shadow-xs border border-gray-200 flex flex-col items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-emerald-50 text-[#075E54] flex items-center justify-center">
                <Music className="w-7 h-7" />
              </div>
              <p className="text-xs font-semibold text-gray-700 text-center truncate max-w-full">{fileName}</p>
              <audio src={mediaUrl} controls className="w-full" />
            </div>
          ) : (
            <div className="p-6 sm:p-8 text-center bg-white rounded-xl shadow-xs border border-gray-200 max-w-md flex flex-col items-center gap-3 w-full">
              <div className="w-16 h-16 rounded-full bg-emerald-50 text-[#075E54] flex items-center justify-center">
                <FileText className="w-8 h-8" />
              </div>
              <div className="max-w-full">
                <h4 className="text-sm font-bold text-gray-900 truncate">{fileName}</h4>
                <p className="text-xs text-gray-400 mt-0.5 font-mono truncate">{mimeType || 'Document'}</p>
              </div>
              <button
                onClick={handleDownload}
                className="mt-2 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-[#075E54] text-white text-xs font-semibold hover:bg-[#128C7E] transition-colors min-h-[44px] cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Download Document</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
