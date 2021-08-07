/*
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option)
 * any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
 * more details.
 * You should have received a copy of the GNU General Public License along with
 * this program. If not, see http://www.gnu.org/licenses/.
 *
 * Copyright 2021 Matt Fiddaman
 */

const defaultchan = 'omnios';
const nick_col_override = {
	andyf:		'ooce',
	hadfl:		'ooce',
	oetiker:	'ooce',
	mattfidd:	'ooce',
	fenix:		'bot',
	mrscowley:	'bot',
	gitomat:	'bot',
	jinni:		'bot',
};

const u_char = '[\\-;:&=\\+\\$,\\w]'
const u_proto = `(?:https?|ftp)`;
const u_auth = `(?:${u_char}+@)`;
const u_host = `(?:(?:[-a-z0-9]\.?)+)`;
const u_path = `(?:(?:\\/${u_char})+)`;
const u_query = `(?:\\?${u_char})`;
const u_hash = `(?:#${u_char})`;
const url_regex = new RegExp(
    `${u_proto}:\/\/${u_auth}?${u_host}${u_path}?${u_query}?${u_hash}?`, 'i');

let channel_regex = /#[-\w]+/g;
const highlight_regex = /\u{1f409}\u{1f404}\u{1f409}(.+?)\u{1f404}\u{1f409}\u{1f404}/u;
const highlight_remove_regex = /[\u{1f409}\u{1f404}]/ug;
const escapere = /[.*+?^${}()|[\]\\]/g;
const actionre = /^\x01ACTION\s+(.*)\x01$/;

const nicklist = new Map();
let channels = {};
let curchan, curdate;
let pik;
let picker_open = false;
let today;
let initsearch;

// Keybindings

const keybind_disable = (e) => e;

const keybind_main = (e) => {
	if (e.altKey || e.ctrlKey || e.metaKey)
		return;

	switch (e.key) {
	    case '?':
		$('#toggle_help').trigger('click');
		break;
	    case '<':
		switch_channel(false);
		break;
	    case '>':
		switch_channel(true);
		break;
	    case '/':
		$(`#menu_search input[name='search']`).focus().select();
		break;
	    default:
		if (e.shiftKey)
			return;

		switch (e.key) {
		    case 'Escape':
			$('#overlay > * > header:visible')
			    .trigger('click');
			break;
		    case 'Left':
		    case 'ArrowLeft':
			if (!picker_open)
				$('#date_dec').trigger('click');
			break;
		    case 'Right':
		    case 'ArrowRight':
			if (!picker_open)
				$('#date_inc').trigger('click');
			break;
		    case 't':
			$('#date_today').trigger('click');
			break;
		    case 'd':
			$('#toggle_dl').trigger('click');
			break;
		    case 'r':
			$('#refresh').trigger('click');
			break;
		    case 'm':
			$('#toggle_sys').trigger('click');
			break;
		    case 's':
			$('#toggle_settings').trigger('click');
			break;
		    case 'c':
			$('#channels div.current').addClass('sel');
			bindkeys('chansel');
			break;
		    default:
			return;
		}
	}

	e.preventDefault();
};

const keybind_search_bar = (e) => {
	if (e.key === 'Escape') {
		$('#menu_search input:focus').trigger('blur');
	}
};

const keybind_chansel = (e) => {
	const $cur = $('#channels div.sel:first');
	let $next;

	if (e.shiftKey)
		return;

	e.preventDefault();

	switch (e.key) {
	    case 'c':
	    case 'Down':
	    case 'ArrowDown':
		$next = $cur.next();
		if (!$next.length)
			$next = $('#channels div:first');
		$cur.removeClass('sel');
		$next.addClass('sel');
		break;
	    case 'Up':
	    case 'ArrowUp':
		$next = $cur.prev();
		if (!$next.length)
			$next = $('#channels div:last');
		$cur.removeClass('sel');
		$next.addClass('sel');
		break;
	    case ' ':
	    case 'Enter':
		draw_logs($cur.attr('data-channel'), curdate);
		// Fall-through
	    case 'Escape':
		$cur.removeClass('sel');
		bindkeys('main');
		break;
	    default:
		$next = $cur
		    .next(`div[data-channel^='${e.key}']`);
		if (!$next.length)
			$next =
			    $(`#channels div[data-channel^='${e.key}']`)
			    .first();
		if ($next.length) {
			$cur.removeClass('sel');
			$next.addClass('sel');
		}
		break;
	}
};

const keybind_search_overlay = (e) => {
	if (e.altKey || e.ctrlKey || e.metaKey)
		return;

	switch (e.key) {
	    case '/':
		$(`#search_filter_form > form input[name='term']`)
		    .focus()
		    .select();
		break;
	    default:
		if (e.shiftKey)
			return;

		switch (e.key) {
		    case 'Enter':
			$('#submit_search_filters').trigger('click');
			break;
		    case 'Escape':
			$('#overlay > * > header:visible')
			    .trigger('click');
			break;
		    default:
			return;
		}
	}

	e.preventDefault();
};

const keybind_search_overlay_input = (e) => {
	if (e.altKey || e.ctrlKey || e.metaKey)
		return;

	switch (e.key) {
	    case 'Enter':
		$('#submit_search_filters').trigger('click');
		$('#search_filter_form > form').find('input,select')
		    .trigger('blur');
		break;
	    case 'Escape':
		$('#search_filter_form > form').find('input,select')
		    .trigger('blur');
		break;
	    default:
		return;
	}

	e.preventDefault();
};

const keybindings = {
	disable:	keybind_disable,
	main:		keybind_main,
	chansel:	keybind_chansel,
	searchbar:	keybind_search_bar,
	searchoverlay:	keybind_search_overlay,
	searchinput:	keybind_search_overlay_input,
};

(function($) {
	$.fn.enable = function() {
		return this.each(function() {
			$(this)
			    .removeClass('disabled')
			    .prop('disabled', false)
			    .disabled = false;
		});
	};

	$.fn.disable = function() {
		return this.each(function() {
			$(this)
			    .addClass('disabled')
			    .prop('disabled', true)
			    .disabled = true;
		});
	};

	$.fn.max = function() {
		return $(this).map(function () {
			return $(this).text().length;
		}).get().reduce((a, b) => Math.max(a, b), 0);
	};
})(jQuery);

const zero_pad = (num, places) => String(num).padStart(places, '0')

const loader = {
	show : (large = true) => {
		if (large) {
			$('#container, #menu').hide();
			$('#loading_overlay, #loading_container').show();
		} else {
			$('#mini_loader').show();
		}
	},
	hide : (use_nologs = true) => {
		$('html, body').scrollTop(0);
		$('#container, #menu').show();
		$('#title span').width($('#channels').width());
		if (use_nologs) nologs();
		$('#loading_overlay, #loading_container').fadeOut();
		$('#mini_loader').hide();
	}
}

function format_date(d, utco = false) {
	if (localStorage.getItem('utc_setting') === 'true' || utco) {
		return String(
		    zero_pad(d.getUTCFullYear(), 4) + '-' +
		    zero_pad(d.getUTCMonth() + 1, 2) + '-' +
		    zero_pad(d.getUTCDate(), 2));
	}

	return String(
	    zero_pad(d.getFullYear(), 4) + '-' +
	    zero_pad(d.getMonth() + 1, 2) + '-' +
	    zero_pad(d.getDate(), 2));
}

function get_start_ts(d) {
	let ts = d.getTime() / 1000;

	if (localStorage.getItem('utc_setting') !== 'true')
		ts += d.getTimezoneOffset() * 60;

	return ts;
}

function format_time(d) {
	if (localStorage.getItem('utc_setting') === 'true') {
		return String(
		    zero_pad(d.getUTCHours(), 2) + ':' +
		    zero_pad(d.getUTCMinutes(), 2) + ':' +
		    zero_pad(d.getUTCSeconds(), 2) + 'Z');
	}

	return String(
	    zero_pad(d.getHours(), 2) + ':' +
	    zero_pad(d.getMinutes(), 2) + ':' +
	    zero_pad(d.getSeconds(), 2));
}

function fail_msg(msg) {
	$('#fail_msg').text(msg).removeClass('hidden').show();
}

function initialise_settings() {
	if (localStorage.getItem('darkmode') === null) {
		localStorage.setItem('darkmode',
		    window.matchMedia('(prefers-color-scheme: dark)').matches);
	}

	if (localStorage.getItem('hidesys') === 'true')
		$('#toggle_sys').toggleClass('on off');

	if (localStorage.getItem('darkmode') === 'true')
		$('#toggle_dl').trigger('click');

	$('#settings_overlay main .setting').each(function () {
		const id = $(this).find('input').attr('id');

		if (localStorage.getItem(id) === 'true')
			$(`#${id}`).prop('checked', true);
	});
}

function highlight_remove(text) {
	return text.replaceAll(highlight_remove_regex, '');
}

function nick_regex(nick) {
	if (typeof nick_regex.cache === 'undefined')
		nick_regex.cache = {};
	else if (nick in nick_regex.cache)
		return nick_regex.cache[nick];

	const safe_nick = nick.replace(escapere, '\\$&');
	nick_regex.cache[nick] = new RegExp(`^${safe_nick}\\b`, 'g');
	return nick_regex.cache[nick];
}

function nick_clean(nick) {
	return nick.toLowerCase().replaceAll(/^_+|_+$/g, '');
}

function nick_class(nick) {
	const _nick = nick_clean(nick);

	if (typeof nick_class.cache === 'undefined')
		nick_class.cache = {};
	else if (_nick in nick_class.cache)
		return nick_class.cache[_nick];

	if (_nick in nick_col_override) {
		nick_class.cache[_nick] =
		    `nick_col_${nick_col_override[_nick]}`;
		return nick_class.cache[_nick];
	}

	let hash = 0;
	for (let i = 0; i < _nick.length; i++) {
		const char = _nick.charCodeAt(i);
		hash = ((hash << 5) - hash) + char;
		hash = hash & hash; // Truncate to 32-bits
	}

	nick_class.cache[_nick] = `nick_col_${Math.abs(hash % 15)}`;
	return nick_class.cache[_nick];
}

function nick_span(nick, braces = true, nc = true) {
	return $('<span/>')
	    .addClass(nick_class(nick))
	    .addClass(nc ? 'nick' : '')
	    .attr('data-nick', nick)
	    .text(braces ? `<${nick}>` : nick);
}

function jp_span(jp, nick) {
	return $('<span/>')
	    .addClass((jp ? 'join' : 'part') + '_col')
	    .append($('<span/>').text('*** '))
	    .append(nick_span(nick, false, false))
	    .append($('<span/>').text(' has ' + (jp ? 'joined' : 'left') +
	        ' the channel ***'));
}

function parse_msg(msg) {
	const words = msg.split(/(\s+)/).map(v => {
		// Space
		if (v.match(/^\s+$/)) {
			return {
				type: 'SPACE',
				val: v
			};
		}
		// URI
		if ((m = v.match(url_regex)) !== null) {
			let href = v.replace(/\.$/, '');
			if (!v.includes('('))
				href = href.replace(/\)$/, '');

			return {
				type: 'URI',
				href: href,
				trailer: v.slice(href.length),
			};

		}
		// Channel
		if ((m = v.match(channel_regex)) !== null) {
			return {
				type: 'CHANNEL',
				val: m[0],
				trailer: v.slice(m[0].length),
			};
		}
		// Nick
		for (const n of nicklist.keys()) {
			if ((m = v.match(nick_regex(n))) !== null) {
				return {
					type: 'NICK',
					nick: n,
					trailer: v.slice(n.length),
				};
			}
		}
		// Highlight
		if ((m = v.match(highlight_regex)) !== null) {
			val = highlight_remove(v);
			return {
				type: 'HIGHLIGHT',
				val: m[1],
				leader: v.slice(0, m.index),
				trailer: val.slice(m.index + m[1].length),
			};
		}
		// Word
		return { type: 'WORD', val: v };
	});

	// Build words and spaces into phrases
	const pwords = [];
	let phrase = '';
	for (const w of words) {
		if (w.type === 'WORD' ||
		    (phrase.length && w.type === 'SPACE')) {
			phrase += w.val;
			continue;
		} else if (phrase.length) {
			pwords.push({ type: 'PHRASE', val: phrase });
			phrase = '';
		}
		pwords.push(w);
	}
	if (phrase.length)
		pwords.push({ type: 'PHRASE', val: phrase });

	return pwords;
}

function style_msg(_, target) {
	const words = parse_msg($(target).html());

	const msg = words.map(v => {
		switch (v.type) {
		    case 'PHRASE':
			return v.val.replaceAll(
			    /([\u{001d}\u{000d}])(.*?)\u{000f}/ug,
			    (m, code, str) => {
				switch (code) {
				    case `\u001d`:
					return `<i>${str}</i>`;
				    case `\u000d`:
					return `<b>${str}</i>`;
				    default:
					return str;
				}
			});
		    case 'URI':
			return `<a target='_blank' rel='noopener' href='` +
			    v.href + `'>` + v.href + '</a>' + v.trailer;
		    case 'CHANNEL':
			return `<span class='channel_col'>${v.val}</span>` +
			    v.trailer;
		    case 'NICK':
			return nick_span(v.nick, false, false)
			    .prop('outerHTML') + v.trailer;
		    case 'HIGHLIGHT':
			return v.leader +
			    `<span class='highlight'>${v.val}</span>` +
			    v.trailer;
		    case 'SPACE':
		    case 'WORD':
		    default:
			return v.val;
		}
	});

	$(target).html(msg.join(""));
}

function nologs() {
	if (!$('.log_row:visible').length) {
		$('#nologs')
		    .removeClass('hidden')
		    .show()
		    .find('span').text(`#${curchan}`)
		    .next('span').text(curdate);
	} else {
		$('#nologs').hide();
	}
}

function scroll_hash(hash, hl = true) {
	$('div.hl').removeClass('hl');

	if (hl) {
		$(hash).addClass('hl').show();
		window.history.replaceState(null, null, hash);
	}

	if (hash !== '#undefined') {
		const $hash = $(hash);

		if (!$hash.length)
			return;

		$('html, body').animate({
		    scrollTop: $hash.offset().top - 60
		}, 500);
	}
}

function switch_channel(pn) {
	const $current = $('#channels .current');
	let $destination;

	if (pn) {
		$destination = $current.next();

		if ($destination.length === 0)
			$destination = $('#channels div:first');
	} else {
		$destination = $current.prev();

		if ($destination.length === 0)
			$destination = $('#channels div:last');
	}

	draw_logs($destination.attr('data-channel'), curdate);
}

const handlers = {
	JOIN: (v, r) => {
		r.addClass('sysmsg');
		r.find('.message').append(jp_span(true, v.nick));
	},
	PART: (v, r) => {
		r.addClass('sysmsg');
		r.find('.message').append(jp_span(false, v.nick));
	},
	QUIT: (v, r) => {
		r.addClass('sysmsg');
		r.find('.message').append(jp_span(false, v.nick));
	},
	NICK: (v, r) => {

		/*
		 * Update the nick cache to use the same colour for the
		 * new nick as for the old.
		 */

		if (typeof nick_class.cache !== 'undefined') {
			const _nick = nick_clean(v.nick);
			if (_nick in nick_class.cache) {
				nick_class.cache[nick_clean(v.message)] =
				    nick_class.cache[_nick];
			}
		}
		r.find('.message').append(
		    $('<span/>')
		    .addClass('nick_col')
		    .append($('<span/>').text('*** '))
		    .append(nick_span(v.nick, false, false))
		    .append($('<span/>').text(' is now known as '))
		    .append(nick_span(v.message, false, false))
		    .append($('<span/>').text(' ***'))
		);
	},
	PRIVMSG: (v, r) => {
		const $msg = r.find('.message')
		const $nick = r.find('.nick');

		let m;
		if ((m = v.message.match(actionre))) {
			$nick.text('*');
			$msg.text(`${v.nick} ${m[1]}`);
		} else {
			$nick.replaceWith(nick_span(v.nick));
			$msg.text(v.message);
		}
	},
};

function bindkeys(set) {
	window.onkeydown = keybindings[set];
}

async function draw_logs(chan = curchan, date = curdate) {
	if ($('#search_overlay:visible').length > 0)
		$('#search_overlay > header').trigger('click');

	$('#date_dec, #date_inc').disable();
	bindkeys('disable');
	loader.show(false);

	const draw_logs_cleanup = () => {
		loader.hide();
		$('#date_dec, #date_inc').enable();
		$('#toggle_sys_info').text('0 join/part messages not shown');
		bindkeys('main');
	};

	document.title = `#${chan} on ${date}`;
	if (curdate !== date || curchan !== chan) {
		window.history.pushState('history', document.title,
		    `/${chan}/${date}`);
	}

	curdate = date;
	curchan = chan;
	today = format_date(new Date());

	$('#title').find('span').text(`#${chan}`);

	$('#channels > div')
	    .removeClass('current')
	    .each(function() {
		$(this).find('a').attr('href',
		    `/${$(this).attr('data-channel')}/${curdate}`);

		if ($(this).attr('data-channel') === curchan)
			$(this).addClass('current');
	});

	$('#logs').empty();
	$('.fail_msg').hide();

	if (!channels[chan]) {
		draw_logs_cleanup();
		fail_msg(`No such channel ${chan}`);
		$('#nologs').hide();
		return;
	}

	const $topic = $('#topic');
	$topic.text(channels[chan].topic);
	style_msg(0, '#topic');

	pik.setMinDate(new Date(channels[curchan]['begin'] * 1000));
	pik.setMaxDate(new Date(today));

	const start_ts = get_start_ts(new Date(date));

	const api_location = `/api/v1/channel/${chan}/${start_ts}`;

	let log_data;
	try {
		log_data = await $.getJSON(api_location);
	} catch (e) {
		return draw_logs_cleanup();
	}

	const $template = $('#log_line');
	const $logs = $('#logs');
	log_data.forEach(log => {
		const id = `${log['ts']}-${log['message_id']}`;

		nicklist.set(log['nick'], true);

		const $row = $template.clone().attr('id', id);

		const ts = format_time(new Date(log.ts * 1000));

		$row.find('.ts').html(`[${ts}]`);
		$row.find('.ts_link').attr('href', `#${id}`);
		$row.attr('data-cmd', log.command);

		if (log.command in handlers) {
			handlers[log.command](log, $row);
		} else {
			$row.find('.message')
			    .text(`UNHANDLED ${log.command}`);
		}

		$row.removeClass('hidden');

		$logs.append($row);
	});

	$('#logs .log_row .nick').on('click', function () {
		const nick = $(this).attr('data-nick');

		$(`#logs .log_row .nick[data-nick='${nick}']`)
		    .parent('div.log_row')
		    .toggleClass('hlu');
	});

	$logs.append($('<span/>').attr('id', 'end'));

	const longest_nick = $('#logs .log_row > .nick').max();

	$('#logs .log_row > .nick')
	    .css('min-width', `${longest_nick + 2}ch`);

	$(`.log_row[data-cmd='PRIVMSG'] .message`).each(style_msg);

	if ($('#toggle_sys').hasClass('on')) {
		$('#toggle_sys')
		    .toggleClass('on off')
		    .trigger('click');
	}

	$('a.ts_link').on('click', function(e) {
		e.preventDefault();

		if ($(this).parent('.log_row').hasClass('hl')) {
			$(this).parent('.log_row').removeClass('hl');
			window.history.replaceState(null, null,
			    document.location.pathname);

			return;
		}

		scroll_hash($(this).attr('href'));
	});

	if (channels[chan]['begin'] * 1000 !== curdate)
		$('#date_dec').enable();
	if (date !== today)
		$('#date_inc').enable();

	loader.hide();
	bindkeys('main');

	if (initsearch) {
		$(`#menu_search input[name='search']`).val(initsearch);
		initsearch = undefined;
		$('#menu_search form').trigger('submit');
		return;
	}

	if (document.location.hash)
		scroll_hash(document.location.hash);
	else if (curdate === today) {
		const last = localStorage.getItem(`${curchan}-last`);
		const $last = $(`#${last}`);
		const nlast = $('#logs .log_row:last').attr('id');

		if (!last === false && $last.length !== 0) {
			if (last !== nlast &&
			    $last.nextAll('.log_row:visible').length > 0)
				$last.after('<hr/>');

			let scroll_to = last;

			if ($last.is(':hidden')) {
				let $prev = $last
				do {
					$prev = $prev.prev();
				} while ($prev.length && $prev.is(':hidden'));

				scroll_to = $prev.attr('id');
			}

			scroll_hash(`#${scroll_to}`, false);
		}

		localStorage.setItem(`${curchan}-last`, nlast);
	}
}

function sort_search(e) {
	e.preventDefault();

	const $heading = $(this);
	const sort_by = $heading.attr('data-sort');

	let order = 'asc';

	if ($heading.find('i.fas').hasClass('fa-sort') &&
	    $heading.attr('data-sort-reverse') === 'true') {
		order = 'desc';
	}

	if ($heading.find('i.fas').hasClass('fa-sort-up'))
		order = 'desc';

	$('#search_log_headings span i.fas')
	    .removeClass('fa-sort-up fa-sort-down')
	    .addClass('fa-sort');

	tinysort('#search_logs .log_row', {
	    attr: `data-${sort_by}`,
	    natural: true,
	    order: order,
	}, {
	    attr: `data-rank`,
	    natural: true,
	    order: 'desc',
	});

	$heading.find('i.fas')
	    .removeClass('fa-sort')
	    .addClass(order === 'asc' ? 'fa-sort-up' : 'fa-sort-down');
}

async function draw_search(search) {
	const overlay_height = $('#search_overlay').height();
	const heading_height =
	    $('#search_overlay header').height() +
	    $('#search_overlay #search_filters').height()

	bindkeys('disable');

	const logs_height = overlay_height - heading_height - 75;
	$('#search_logs').height(logs_height);

	const $form_chan = $(`#search_filter_form form select[name='chan']`);
	const $form_nick = $(`#search_filter_form form input[name='nick']`);
	const $form_term = $(`#search_filter_form form input[name='term']`);

	$form_chan.find(`option:not([value=''])`).remove();
	$form_chan.find('option').attr('selected', true);

	for (const channel in channels) {
		const $option = $('<option/>')
		    .attr('value', channel)
		    .text(channel);

		if (channel === search['channel']) {
			$form_chan.find('option[selected]')
			    .removeAttr('selected');

			$option.attr('selected', true);
		}

		$form_chan.append($option)
	}

	$form_chan.on('change', () => {
		$('#submit_search_filters').trigger('click');
	});

	$form_nick.val(search['nick']);
	$form_term.val(search['term']);

	$('#search_logs, #search_nologs').hide();
	$('#search_loader').show();
	$('#search_logs .log_row').remove();
	$('#search_log_headings span i.fas')
	    .removeClass('fa-sort-up fa-sort-down')
	    .addClass('fa-sort');
	$(`#search_log_headings span[data-sort='rank'] i.fas`)
	    .removeClass('fa-sort')
	    .addClass('fa-sort-down');

	let search_str = '';
	['channel', 'nick'].forEach(x => {
		if (search[x])
		       search_str += `${x}:${search[x]} `;
	});
	search_str += search['term'];

	$('#search_permalink').attr('href', '/search/' +
	    encodeURIComponent(search_str));

	const api_location = '/api/v1/search';

	const api_opts = { q: search['term'], page: 1, limit: 200 };

	['channel', 'nick', 'page'].forEach(x => {
		if (search[x])
			api_opts[x] = search[x];
	});

	let logs;
	try {
		logs = await $.getJSON(api_location, api_opts);
	} catch (e) {
		logs = [];
	}

	if (!logs.length) {
		$('#search_loader').hide();
		$('#search_nologs').show();
		bindkeys('searchoverlay');
		return;
	}

	const $template = $('#search_log_line');
	const $logs = $('#search_logs');

	const grid_sizing = {
		channel: '',
		rank: '7ch',
		date: '22ch',
		nick: '',
		message: 'auto',
	};

	let i = 0;
	logs.forEach(log => {
		const d = new Date(log['ts'] * 1000);
		const date = format_date(d);

		const $row = $template.clone()
		    .attr('id', `search_${i++}`)
		    .removeClass('hidden');

		nicklist.set(log['nick'], true);

		$row.find('.channel').text(`#${log['channel']}`);

		const rank = Math.min(Math.abs(log['rank']), 15);
		const rankp = Math.round(rank * 100 / 15);
		$row.find('.rank')
		    .attr('value', rank)
		    .attr('title', `${rankp}%`)
		    .find('span')
		    .width(`${rankp}%`);

		$row.find('.date').text(date);
		$row.find('.ts').text(format_time(d));

		$row.find('.ts_link').attr('href',
		    `/${log['channel']}#${log['ts']}-${log['message_id']}`);

		$row.find('.nick').replaceWith(nick_span(log['nick']));

		$row.find('.message').text(log['message']);

		$row
		    .attr('data-rank', rankp)
		    .attr('data-channel', log['channel'])
		    .attr('data-date', date)
		    .attr('data-ts', log['ts'])
		    .attr('data-nick', log['nick']);

		$logs.append($row);
	});

	const chan_max = $logs.find('.log_row .channel').max();
	const nick_max = $logs.find('.log_row .nick').max();

	grid_sizing['channel'] = `${chan_max + 2}ch`;
	grid_sizing['nick'] = `${nick_max + 3}ch`;

	let grid_sizing_str = '';
	for (const size in grid_sizing) {
		grid_sizing_str += `${grid_sizing[size]} `;
	}

	$('#search_logs .log_row, #search_logs .log_row_head')
	    .css('grid-template-columns', grid_sizing_str.trim());

	$('#search_logs .message').each(style_msg);

	$('#search_logs').show();
	$('#search_log_container,#search_logs').scrollTop(0);
	$('#search_loader').hide();
	bindkeys('searchoverlay');
}

$(async () => {
	if ('serviceWorker' in navigator)
		navigator.serviceWorker.register('/sw.js')

	$('#toggle_sys').on('click', function() {
		const $rows = $('.sysmsg');

		$(this).toggleClass('on off');
		localStorage.setItem('hidesys', $(this).hasClass('on'));

		if ($(this).hasClass('on')) {
			$(this).find('span').text(
			    `${$rows.length} join/part message` +
			    ($rows.length === 1 ? '' : 's') + ' not shown');
			$rows.hide();
		} else {
			$(this).find('span').html('&nbsp;');
			$rows.fadeIn(400);
		}
		nologs();
	});

	$('#toggle_dl').on('click', function() {
		const $icon = $(this).find('i');

		if ($icon.hasClass('fas'))
			$('html').removeAttr('dark');
		else
			$('html').attr('dark', 'true');

		$icon.toggleClass('fas far');

		localStorage.setItem('darkmode', $icon.hasClass('fas'));
	});

	$('#utc_setting').on('click', function() {
		localStorage.setItem('utc_setting', $(this).is(':checked'));
		$('#toggle_settings').trigger('click');
		draw_logs();
	});

	initialise_settings();

	loader.show();

	try {
		channels = await $.getJSON('/api/v1/channel');
	} catch (e) {
		fail_msg('Error fetching channels');
		loader.hide(false);
		return;
	}

	const $template = $('#channel_line');
	const $channels = $('#channels');

	$.each(channels, (k, _) => {
		const channel = k;

		const row = $template.clone()
		    .removeAttr('id')
		    .attr('data-channel', channel);

		row.find('.channel')
		    .text(`#${channel}`);

		row.removeClass('hidden');

		$channels.append(row);
	});

	const path = document.location.pathname;
	today = format_date(new Date());

	// URL parsing

	let result;
	// /search/:term
	if ((result = path.match(/^\/search\/(.*)$/))) {
		curchan = defaultchan;
		curdate = today;
		try {
			initsearch = decodeURIComponent(result[1]);
		} catch (e) {
			console.log(e);
		}
	// /:channel/:yyyy-mm-dd
	} else if ((result = path.match(
	    /^\/([-a-z]+)\/(\d{4}-\d{2}-\d{2})$/i)) && result[1] in channels) {
		curchan = result[1];
		curdate = result[2];
		let cm;
		if (document.location.hash &&
		    (cm = document.location.hash.match(/^#(\d+)-(\d+)$/))) {
			const ts = cm[1];
			const message_id = cm[2];
			const d = format_date(new Date(ts * 1000));

			if (d !== curdate) {
				document.location.href =
				    `/${curchan}/${d}#${ts}-${message_id}`;
				return;
			}
		}
	// /:channel
	} else if ((result = path.match(/^\/([-a-z]+)/i)) &&
	    result[1] in channels) {
		let cm;
		if (document.location.hash &&
		    (cm = document.location.hash.match(/^#(\d+)-(\d+)$/))) {
			const ts = cm[1];
			const message_id = cm[2];
			const d = format_date(new Date(ts * 1000));
			document.location.href =
			    `/${result[1]}/${d}#${ts}-${message_id}`;
		} else {
			document.location.href = `/${result[1]}/${today}`;
		}
		return;
	} else {
		document.location.href = `/${defaultchan}/${today}`;
		return;
	}

	channel_regex = new RegExp(
	    `#(${Object.keys(channels).join('|')})(?!-)\\b`, 'g');

	pik = new Pikaday({
		field: $('#datepicker')[0],
		firstDay: 1,
		defaultDate: new Date(curdate),
		setDefaultDate: true,
		minDate: new Date(channels[curchan]['begin'] * 1000),
		maxDate: new Date(today),
		format: 'YYYY-MM-DD',
		showDaysInNextAndPreviousMonths: true,
		enableSelectionDaysInNextAndPreviousMonths: true,
		onSelect: () => { draw_logs(curchan, pik.toString()); },
		onOpen: () => { picker_open = true; },
		onClose: () => { picker_open = false; }
	});

	pik.setDate(curdate);

	$('#date_today').on('click', () => {
		pik.setDate(today);
	});

	$('#date_inc').on('click', function() {
		if ($(this).prop('disabled')) return;
		pik.setMoment(pik.getMoment().add(1, 'days'));
	});

	$('#date_dec').on('click', function() {
		if ($(this).prop('disabled')) return;
		pik.setMoment(pik.getMoment().subtract(1, 'days'));
	});

	$('#scroll_down').on('click', () => {
		$('html, body').animate({
		    scrollTop: $('#log_end').offset().top
		}, 1000);
	});

	$('#scroll_up').on('click', () => {
		$('html, body').animate({
		    scrollTop: $('#logs .log_row:first').offset().top - 35
		}, 500);
	});

	$('#refresh').on('click', () => {
		window.history.replaceState(null, null,
		    document.location.pathname);
		draw_logs();
	});

	$('#toggle_help, #help_overlay > header').on('click', () => {
		if ($('#overlay > div:not(#help_overlay):visible').length)
			return;
		$('#overlay, #help_overlay').toggle();
	});

	$('#toggle_settings, #settings_overlay > header').on('click', () => {
		if ($('#overlay > div:not(#settings_overlay):visible').length)
			return
		$('#overlay, #settings_overlay').toggle();
	});

	$('#search_overlay > header').on('click', () => {
		if ($('#overlay > div:not(#search_overlay):visible').length)
			return
		$('#overlay, #search_overlay').toggle();
		$('body').toggleClass('no_scroll');
		if ($('#search_overlay:visible').length)
			bindkeys('searchoverlay');
		else
			bindkeys('main');
	});

	$('#search_filter_form').find('input, select').on('focus', () => {
		bindkeys('searchinput');
	});

	$('#search_filter_form').find('input, select').on('blur', () => {
		if ($('#search_overlay:visible').length)
			bindkeys('searchoverlay');
	});

	$('#submit_search_filters').on('click', async function() {
		if ($(this).prop('disabled')) return;
		$(this).disable();

		const search_opts = {}

		search_opts['channel'] =
		    $(`#search_filter_form select[name='chan']`).val();
		search_opts['nick'] =
		    $(`#search_filter_form input[name='nick']`).val();
		search_opts['term'] =
		    $(`#search_filter_form input[name='term']`).val();

		await draw_search(search_opts);
		$(this).enable();
	});

	$('#search_logs').on('click', '.log_row', function(e) {
		e.preventDefault();

		const href = $(this).find('.ts_link').attr('href');

		let hm;
		if (!(hm = href.match(/^\/([-a-z]+)#(\d+)-(\d+)$/)))
			return;

		const d = format_date(new Date(hm[2] * 1000));

		curchan = hm[1];
		pik.setDate(d);
		window.history.replaceState(null, null,
		    `/${hm[1]}/${d}#${hm[2]}-${hm[3]}`);
	});

	$('#search_logs').on('click',
	    '.log_row_head#search_log_headings > span[data-sort]',
	    sort_search);

	$('#menu_search form').on('submit', async function (e) {
		e.preventDefault();
		$(`#menu_search input[name='search']`).trigger('blur');

		const $input = $(this).children(`input[name='search']`);
		const search = $input.val();

		if (search === '') return;

		let search_term, search_channel, search_nick;
		search_term = '';
		for (const word of search.split(/\s+/)) {
			let result;
			if ((result = word.match(/^nick:(\S+)/i))) {
				search_nick = result[1];
			} else if ((result =
			    word.match(/^chan(?:nel)?:(\S+)/i))) {
				if (result[1] in channels)
					search_channel = result[1];
			} else {
				search_term += `${word} `;
			}
		}

		search_term = search_term.trim();

		const search_opts = {
			channel: search_channel,
			nick: search_nick,
			term: search_term
		};

		$('#search_overlay > header').trigger('click');
		draw_search(search_opts);
	});

	const search_expand = () => {
		const offset = 40;
		const avail =
		    $('#menu').width() - $('#menu_left').width() - offset;
		$('#menu_right input').width(Math.min(avail, 400));
	};

	const search_contract = () => {
		$('#menu_right input:not(:focus)').width(12);
	};

	$('#menu_right form').hover(search_expand, search_contract);

	$('#menu_right input').on('focus', () => {
		bindkeys('searchbar');
		search_expand();
	});

	$('#menu_right input').on('blur', () => {
		search_contract();
		bindkeys('main');
	});

	$('#channels').on('click', 'div', function(e) {
		e.preventDefault();
		draw_logs($(this).attr('data-channel'), curdate);
	});

	bindkeys('main');
});

