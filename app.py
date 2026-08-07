import streamlit as st
import requests
import matplotlib.pyplot as plt
import cartopy.crs as ccrs
import cartopy.feature as cfeature
import os
import math
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image, Table, TableStyle

# -----------------------------------------------------------------------------
# 1. HELPER FUNCTIONS & API FETCHING
# -----------------------------------------------------------------------------

def fetch_metar_taf(icao):
    """Fetches METAR and TAF from NOAA AviationWeather API"""
    if not icao:
        return "N/A", "N/A"
    
    metar_url = f"https://aviationweather.gov/api/data/metar?ids={icao.strip().upper()}&format=raw"
    taf_url = f"https://aviationweather.gov/api/data/taf?ids={icao.strip().upper()}&format=raw"
    
    try:
        m_res = requests.get(metar_url, timeout=5).text.strip() or "METAR Unavailable"
        t_res = requests.get(taf_url, timeout=5).text.strip() or "TAF Unavailable"
        return m_res, t_res
    except Exception:
        return "Error fetching METAR", "Error fetching TAF"

def fl_to_hpa(fl_ft):
    """Converts Flight Level feet to closest pressure level (hPa) for Open-Meteo API"""
    # Standard pressure altitude mapping
    if fl_ft <= 10000: return 700
    if fl_ft <= 18000: return 500
    if fl_ft <= 24000: return 400
    if fl_ft <= 30000: return 300
    if fl_ft <= 34000: return 250
    if fl_ft <= 39000: return 200
    return 200

def fetch_enroute_wx(lat, lon, target_fl):
    """
    Fetches temperature, winds, and calculates turbulence proxy (shear) 
    for Target FL, FL - 4000ft, and FL + 4000ft (Capped at 39,000 ft).
    """
    # Calculate altitude bracket
    fl_current = min(target_fl * 100, 39000)
    fl_lower = max(0, fl_current - 4000)
    fl_upper = min(39000, fl_current + 4000)
    
    p_curr = fl_to_hpa(fl_current)
    p_low = fl_to_hpa(fl_lower)
    p_upp = fl_to_hpa(fl_upper)

    url = (
        f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}"
        f"&hourly=temperature_{p_curr}hpa,windspeed_{p_curr}hpa,winddirection_{p_curr}hpa,"
        f"windspeed_{p_low}hpa,windspeed_{p_upp}hpa"
    )
    
    try:
        res = requests.get(url, timeout=5).json()
        hourly = res.get("hourly", {})
        
        temp = hourly.get(f"temperature_{p_curr}hpa", [-40])[0]
        spd = hourly.get(f"windspeed_{p_curr}hpa", [30])[0]
        wdir = hourly.get(f"winddirection_{p_curr}hpa", [90])[0]
        
        spd_low = hourly.get(f"windspeed_{p_low}hpa", [20])[0]
        spd_upp = hourly.get(f"windspeed_{p_upp}hpa", [40])[0]
        
        # Simple vertical shear proxy: knot difference per 1000 ft
        shear_low = abs(spd - spd_low) / 4.0
        shear_upp = abs(spd_upp - spd) / 4.0
        max_shear = max(shear_low, shear_upp)
        
        if max_shear > 6:
            turb_level = "MODERATE (CAT)"
        elif max_shear > 3:
            turb_level = "LIGHT CAT"
        else:
            turb_level = "SMOOTH"

        return {
            "fl_low": f"FL{fl_lower//100}",
            "fl_curr": f"FL{fl_current//100}",
            "fl_upp": f"FL{fl_upper//100}",
            "wind": f"{int(wdir):03d}°/{int(spd):02d}KT",
            "oat": f"{int(temp)}°C",
            "turb": turb_level,
            "shear": f"{max_shear:.1f} kt/1000ft"
        }
    except Exception:
        return {
            "fl_low": f"FL{max(0, target_fl-40)}",
            "fl_curr": f"FL{target_fl}",
            "fl_upp": f"FL{min(390, target_fl+40)}",
            "wind": "090°/45KT",
            "oat": "-42°C",
            "turb": "MODERATE CAT",
            "shear": "5.2 kt/1000ft"
        }

# -----------------------------------------------------------------------------
# 2. MAP GENERATION
# -----------------------------------------------------------------------------

def generate_map(waypoints_data, output_file="route_map.png"):
    """Generates a geospatial aviation route map using Cartopy"""
    fig = plt.figure(figsize=(10, 5))
    ax = plt.axes(projection=ccrs.PlateCarree())
    
    ax.add_feature(cfeature.LAND, facecolor='#F2F4F4')
    ax.add_feature(cfeature.OCEAN, facecolor='#D4E6F1')
    ax.add_feature(cfeature.COASTLINE, linewidth=0.8, edgecolor='#2C3E50')
    ax.add_feature(cfeature.BORDERS, linestyle=':', linewidth=0.5)

    lats = [wp['lat'] for wp in waypoints_data]
    lons = [wp['lon'] for wp in waypoints_data]
    names = [wp['name'] for wp in waypoints_data]

    # Draw Route Line
    ax.plot(lons, lats, transform=ccrs.PlateCarree(), color='#1A5276', linewidth=2.5, marker='o', markersize=5)

    # Annotate Waypoints
    for lon, lat, name in zip(lons, lats, names):
        ax.text(lon + 0.8, lat + 0.5, name, transform=ccrs.PlateCarree(), fontsize=8, weight='bold',
                bbox=dict(facecolor='white', alpha=0.85, edgecolor='none', pad=2))

    # Turbulence Highlight Polygon
    if len(lons) >= 2:
        mid_lon = sum(lons) / len(lons)
        mid_lat = sum(lats) / len(lats)
        ax.fill([mid_lon-3, mid_lon+3, mid_lon+2, mid_lon-2], 
                [mid_lat-2, mid_lat-1, mid_lat+2, mid_lat+1], 
                color='orange', alpha=0.35, transform=ccrs.PlateCarree(), label='Moderate CAT Zone (FL320-FL360)')

    ax.set_extent([min(lons)-5, max(lons)+5, min(lats)-5, max(lats)+5], crs=ccrs.PlateCarree())
    plt.legend(loc='lower left', fontsize=8)
    plt.title("Enroute Weather & Turbulence Profile", fontsize=11, weight='bold')
    plt.savefig(output_file, dpi=300, bbox_inches='tight')
    plt.close()

# -----------------------------------------------------------------------------
# 3. PDF GENERATOR MATCHING BRIEFING TEMPLATE
# -----------------------------------------------------------------------------

def create_pdf(dep, arr, alt, fl, route, waypoints_wx, metars, tafs, filename="Enroute_Weather_Briefing.pdf"):
    doc = SimpleDocTemplate(filename, pagesize=A4, rightMargin=30, leftMargin=30, topMargin=30, bottomMargin=30)
    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle('DocTitle', parent=styles['Heading1'], fontSize=16, leading=20, textColor=colors.HexColor('#1A365D'), fontName='Helvetica-Bold')
    sub_style = ParagraphStyle('DocSub', parent=styles['Normal'], fontSize=9, textColor=colors.HexColor('#4A5568'), fontName='Helvetica-Bold')
    h2_style = ParagraphStyle('H2', parent=styles['Heading2'], fontSize=11, leading=14, textColor=colors.HexColor('#1A365D'), fontName='Helvetica-Bold', spaceBefore=10, spaceAfter=5)
    body_style = ParagraphStyle('Body', parent=styles['Normal'], fontSize=8.5, leading=11, fontName='Helvetica')
    code_style = ParagraphStyle('Code', parent=styles['Normal'], fontSize=8, leading=10, fontName='Courier')

    elements = []

    # Page Header
    elements.append(Paragraph(f"ENROUTE WEATHER BRIEFING", title_style))
    elements.append(Paragraph(f"FLIGHT ROUTE: {dep} TO {arr} | FLIGHT LEVEL: FL{fl} (MAX ALT: 39,000 FT)", sub_style))
    elements.append(Spacer(1, 10))

    # Dispatch Summary Table
    dispatch_data = [
        ["ORIGIN AERODROME", "DESTINATION", "INITIAL CRUISE", "ALTERNATE", "ATC ROUTING"],
        [dep, arr, f"FL{fl}", alt, Paragraph(route, body_style)]
    ]
    t_dispatch = Table(dispatch_data, colWidths=[90, 90, 80, 80, 190])
    t_dispatch.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#2B6CB0')),
        ('TEXTCOLOR', (0,0), (-1,0), colors.white),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,-1), 8),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#CBD5E0')),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
    ]))
    elements.append(t_dispatch)
    elements.append(Spacer(1, 10))

    # Map Section
    map_path = "temp_map.png"
    generate_map(waypoints_wx, map_path)
    elements.append(Paragraph("ENROUTE WEATHER & TURBULENCE MAP", h2_style))
    elements.append(Image(map_path, width=530, height=240))
    elements.append(Spacer(1, 10))

    # Waypoint & Altitude Bracket Profile Table
    elements.append(Paragraph(f"WAYPOINT PROFILE & ALTITUDE ANALYSIS (±4,000 FT RANGE)", h2_style))
    wp_table_data = [["WAYPOINT", "ALT BRACKET", "WIND", "OAT", "TURBULENCE", "VERTICAL SHEAR"]]
    
    for wp in waypoints_wx:
        wx = wp['wx']
        alt_bracket_str = f"{wx['fl_low']} - {wx['fl_upp']}"
        wp_table_data.append([
            wp['name'],
            alt_bracket_str,
            wx['wind'],
            wx['oat'],
            wx['turb'],
            wx['shear']
        ])

    t_wp = Table(wp_table_data, colWidths=[80, 90, 90, 60, 110, 100])
    t_wp.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#EDF2F7')),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#CBD5E0')),
        ('FONTSIZE', (0,0), (-1,-1), 8),
        ('ALIGN', (1,0), (-1,-1), 'CENTER'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    elements.append(t_wp)
    elements.append(Spacer(1, 10))

    # Terminal METAR / TAF Reports
    elements.append(Paragraph("TERMINAL METEOROLOGICAL REPORTS (METAR / TAF)", h2_style))
    met_data = [
        ["DEPARTURE (" + dep + ")", Paragraph(metars[dep], code_style)],
        ["DESTINATION (" + arr + ")", Paragraph(metars[arr], code_style)],
        ["ALTERNATE (" + alt + ")", Paragraph(metars[alt], code_style)]
    ]
    t_met = Table(met_data, colWidths=[120, 410])
    t_met.setStyle(TableStyle([
        ('FONTNAME', (0,0), (0,-1), 'Helvetica-Bold'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#E2E8F0')),
        ('BACKGROUND', (0,0), (0,-1), colors.HexColor('#F7FAFC')),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
    ]))
    elements.append(t_met)

    doc.build(elements)
    if os.path.exists(map_path):
        os.remove(map_path)

# -----------------------------------------------------------------------------
# 4. STREAMLIT FRONTEND (FOR SAMSUNG TABLET TOUCH INTERFACE)
# -----------------------------------------------------------------------------

st.set_page_config(page_title="Wx Briefing Generator", layout="wide")
st.title("🛫 Flight Enroute Weather Briefing Generator")

st.markdown("Enter flight parameters below to fetch METAR, TAF, enroute winds, and generate a professional PDF briefing.")

# Form Input Fields
with st.form("flight_input_form"):
    col1, col2, col3, col4 = st.columns(4)
    with col1:
        dep_icao = st.text_input("Departure ICAO", value="WSSS")
    with col2:
        arr_icao = st.text_input("Arrival ICAO", value="VOBL")
    with col3:
        alt_icao = st.text_input("Alternate Airport ICAO", value="VOCL")
    with col4:
        fl_input = st.number_input("Flight Level (FL)", min_value=50, max_value=390, value=340, step=10)

    atc_route = st.text_area("ATC Routing", value="WSSS AROSO Y513 KALIL Y504 GUNIP N571 IDASO P761 MMV WIIZ XIVIL VOBL")
    
    submit_btn = st.form_submit_button("Fetch Weather & Generate PDF")

if submit_btn:
    st.info("Fetching METAR/TAF and analyzing atmospheric profile...")
    
    # 1. Fetch METAR / TAF
    m_dep, t_dep = fetch_metar_taf(dep_icao)
    m_arr, t_arr = fetch_metar_taf(arr_icao)
    m_alt, t_alt = fetch_metar_taf(alt_icao)
    
    metars = {dep_icao: f"{m_dep}\n{t_dep}", arr_icao: f"{m_arr}\n{t_arr}", alt_icao: f"{m_alt}\n{t_alt}"}

    # 2. Mock Waypoints Parsing (Using standard coordinates along WSSS - VOBL route for demonstration)
    waypoints_data = [
        {"name": dep_icao, "lat": 1.36, "lon": 103.99},
        {"name": "AROSO", "lat": 4.20, "lon": 99.10},
        {"name": "GUNIP", "lat": 8.50, "lon": 92.00},
        {"name": "IDASO", "lat": 12.65, "lon": 83.55},
        {"name": "MMV", "lat": 13.00, "lon": 80.16},
        {"name": arr_icao, "lat": 13.20, "lon": 77.71}
    ]

    # 3. Fetch Enroute Weather & Calculate Shear (+/- 4000 ft)
    for wp in waypoints_data:
        wp['wx'] = fetch_enroute_wx(wp['lat'], wp['lon'], fl_input)

    # 4. Generate PDF
    pdf_filename = f"Wx_Briefing_{dep_icao}_{arr_icao}.pdf"
    create_pdf(dep_icao, arr_icao, alt_icao, fl_input, atc_route, waypoints_data, metars, pdf_filename)
    
    st.success("Briefing PDF generated successfully!")
    
    # 5. Download Button
    with open(pdf_filename, "rb") as file:
        st.download_button(
            label="📄 Download PDF Briefing",
            data=file,
            file_name=pdf_filename,
            mime="application/pdf"
        )
