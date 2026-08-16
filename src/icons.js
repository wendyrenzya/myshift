// src/icons.js — ikon dari paket lucide (vanilla JS, bukan lucide-react karena app ini vanilla JS/Vite)
import {
  createElement,
  X,
  Wrench,
  UsersRound,
  Share2,
  Image,
  FileText,
  ArrowLeftRight,
  Pencil,
  Copy,
  Ban,
  Download,
  Upload,
  ChevronDown,
  Sparkles,
  Eye,
  Cloud,
  CloudUpload,
  CloudDownload,
  Info,
  Settings,
} from 'lucide'

const ICONS = {
  closeIcon: X,
  wrench: Wrench,
  usersRound: UsersRound,
  share: Share2,
  image: Image,
  fileText: FileText,
  swap: ArrowLeftRight,
  pencil: Pencil,
  copy: Copy,
  ban: Ban,
  download: Download,
  upload: Upload,
  chevronDown: ChevronDown,
  sparkles: Sparkles,
  eye: Eye,
  cloud: Cloud,
  cloudUpload: CloudUpload,
  cloudDownload: CloudDownload,
  info: Info,
  settings: Settings,
}

export function svgIcon(id) {
  const iconNode = ICONS[id]
  if (!iconNode) return ''
  return createElement(iconNode).outerHTML
}
