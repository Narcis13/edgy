// The icons a cell can show, by their Lucide names.

import {
  Activity, Anchor, Apple, Archive, Atom, Award, Banknote, Battery, Bell, Bike, Bookmark, BookOpen, Bot, Brain, Briefcase, Bug,
  Building2, Calculator, CalendarDays, Camera, Car, Check, CircleAlert, Clock, Cloud, Coffee, Cpu, CreditCard, Crown, Database,
  Dna, DollarSign, Droplet, Dumbbell, Euro, Eye, Feather, FileText, Flag, Flame, FlaskConical, Folder, Gamepad2, Gem, Gift,
  Globe, GraduationCap, Hammer, Handshake, Headphones, Heart, Hourglass, House, Inbox, Info, Key, Landmark, Laptop, Leaf,
  Lightbulb, Lock, type LucideIcon, Mail, MapPin, Mic, Microscope, Monitor, Moon, Music, Newspaper, Package, Paintbrush, Paperclip,
  PartyPopper, PenLine, Percent, Phone, PiggyBank, Pizza, Plane, Printer, Puzzle, Receipt, Rocket, Scale, Scissors, Search,
  Server, Shield, ShoppingCart, Smartphone, Smile, Sparkles, Star, Stethoscope, Sun, Tag, Target, ThumbsUp, Timer, TrendingDown,
  TrendingUp, TriangleAlert, Trophy, Truck, Users, Utensils, Video, Wallet, Wifi, Wrench, X, Zap,
  Trash2, Pencil, Copy, ExternalLink, Send, CircleCheck, CircleX, Undo2, Plus, Minus, Download, Share2,
} from 'lucide-react';

export const CELL_ICONS: Record<string, LucideIcon> = {
  sparkles: Sparkles, star: Star, heart: Heart, check: Check, x: X, info: Info, 'circle-alert': CircleAlert, 'triangle-alert': TriangleAlert,
  'thumbs-up': ThumbsUp, smile: Smile, flag: Flag, bell: Bell, bookmark: Bookmark, tag: Tag, target: Target, trophy: Trophy, award: Award,
  crown: Crown, gem: Gem, gift: Gift, 'party-popper': PartyPopper, zap: Zap, flame: Flame, lightbulb: Lightbulb, rocket: Rocket,
  'trending-up': TrendingUp, 'trending-down': TrendingDown, activity: Activity, percent: Percent, calculator: Calculator,
  'dollar-sign': DollarSign, euro: Euro, wallet: Wallet, 'piggy-bank': PiggyBank, banknote: Banknote, 'credit-card': CreditCard,
  receipt: Receipt, landmark: Landmark, scale: Scale, 'shopping-cart': ShoppingCart, package: Package, truck: Truck, briefcase: Briefcase,
  'building-2': Building2, handshake: Handshake, users: Users, 'graduation-cap': GraduationCap, house: House, 'map-pin': MapPin,
  globe: Globe, plane: Plane, car: Car, bike: Bike, anchor: Anchor, sun: Sun, moon: Moon, cloud: Cloud, droplet: Droplet, leaf: Leaf,
  feather: Feather, apple: Apple, pizza: Pizza, coffee: Coffee, utensils: Utensils, dumbbell: Dumbbell, stethoscope: Stethoscope,
  microscope: Microscope, 'flask-conical': FlaskConical, dna: Dna, atom: Atom, brain: Brain, bot: Bot, cpu: Cpu, server: Server,
  database: Database, wifi: Wifi, battery: Battery, smartphone: Smartphone, laptop: Laptop, monitor: Monitor, printer: Printer,
  camera: Camera, video: Video, mic: Mic, music: Music, headphones: Headphones, 'gamepad-2': Gamepad2, puzzle: Puzzle,
  mail: Mail, phone: Phone, inbox: Inbox, archive: Archive, folder: Folder, 'file-text': FileText, paperclip: Paperclip,
  'book-open': BookOpen, newspaper: Newspaper, 'pen-line': PenLine, paintbrush: Paintbrush, scissors: Scissors, hammer: Hammer,
  wrench: Wrench, key: Key, lock: Lock, shield: Shield, bug: Bug, eye: Eye, search: Search, clock: Clock, timer: Timer,
  hourglass: Hourglass, 'calendar-days': CalendarDays,
  'trash-2': Trash2, pencil: Pencil, copy: Copy, 'external-link': ExternalLink, send: Send, 'circle-check': CircleCheck,
  'circle-x': CircleX, 'undo-2': Undo2, plus: Plus, minus: Minus, download: Download, 'share-2': Share2,
};

export const ICON_NAMES = Object.keys(CELL_ICONS);
