"""Rebuild the original BASELINE athletes with Blender 4.3+.
Run: blender --background --python tools/build-athletes.py
All geometry and materials are original; no external model assets are required.
"""
import bpy
import math
import random
from mathutils import Vector
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / 'tennis/assets/models'
OUT.mkdir(parents=True, exist_ok=True)
bpy.context.preferences.filepaths.save_version = 0


def color(value):
    rgb = [int(value[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(c / 12.92 if c < .04045 else ((c + .055) / 1.055) ** 2.4 for c in rgb) + (1,)


def mat(name, hex_value, rough=.7):
    result = bpy.data.materials.new(name)
    result.diffuse_color = color(hex_value)
    result.use_nodes = True
    bsdf = result.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = result.diffuse_color
    bsdf.inputs['Roughness'].default_value = rough
    return result


def bind(obj, material, bone):
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    group = obj.vertex_groups.new(name=bone)
    group.add(list(range(len(obj.data.vertices))), 1, 'REPLACE')
    parts.append(obj)
    return obj


def ellipsoid(name, position, scale, material, bone, segments=32):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=20, location=position)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return bind(obj, material, bone)


def rings(name, profile, material, bone, segments=32):
    # A profile contains height, x radius, y radius and y offset.
    vertices, faces = [], []
    if name in ('Shirt', 'Shorts leg', 'Tennis skirt'):
        dense = []
        for a, b in zip(profile, profile[1:]):
            count = max(1, math.ceil(abs(b[0]-a[0]) / .025))
            for step in range(count):
                t = step / count
                dense.append(tuple(a[i]*(1-t)+b[i]*t for i in range(4)))
        profile = dense + [profile[-1]]
        segments = 48
    for z, rx, ry, cy in profile:
        for i in range(segments):
            t = 2 * math.pi * i / segments
            x, y = rx * math.cos(t), cy + ry * math.sin(t)
            if name == 'Face' and math.sin(t) > 0:
                # Cheekbones, eye sockets and chin: sculpt the front of the head.
                front = math.sin(t) ** 4
                cheek = .008 * math.exp(-((abs(x)-.057)/.026)**2 - ((z-1.735)/.025)**2)
                socket = .006 * math.exp(-((abs(x)-.041)/.023)**2 - ((z-1.763)/.014)**2)
                y += front * (cheek - socket)
            elif name in ('Shirt', 'Shorts leg', 'Tennis skirt'):
                amplitude = .0025 if name == 'Shirt' else .0035
                fold = amplitude * math.sin(t * (12 if name == 'Tennis skirt' else 7) + z * 11)
                x += math.cos(t) * fold; y += math.sin(t) * fold
            vertices.append((x, y, z))
    for row in range(len(profile) - 1):
        for i in range(segments):
            a = row * segments + i
            b = row * segments + (i + 1) % segments
            faces.append((a, b, b + segments, a + segments))
    faces.extend([tuple(reversed(range(segments))), tuple(range((len(profile) - 1) * segments, len(profile) * segments))])
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    result = bind(obj, material, bone)
    result.data.polygons[-1].use_smooth = False
    result.data.polygons[-2].use_smooth = False
    return result


def tube(name, points, radius, material, bone, sides=8):
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.resolution_u = 2
    curve.bevel_depth = radius
    curve.bevel_resolution = 1
    spline = curve.splines.new('POLY')
    spline.points.add(len(points) - 1)
    for point, xyz in zip(spline.points, points):
        point.co = (*xyz, 1)
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target='MESH')
    obj.select_set(False)
    return bind(obj, material, bone)


def segment(name, start, end, radius, material, bone, width=1):
    start, end = Vector(start), Vector(end)
    profiles = {
        'Upper arm': [(0,1),(.2,1),(.55,.85),(1,.62)],
        'Forearm': [(0,.75),(.25,1),(.6,.83),(1,.6)],
        'Thigh': [(0,1.08),(.3,1),(.65,.85),(1,.59)],
        'Calf': [(0,.7),(.3,.96),(.5,.93),(.8,.7),(1,.53)],
        'Short sleeve': [(0,1),(.5,1.01),(1,.96)],
    }
    if name in profiles:
        length = (end - start).length
        obj = rings(name, [(t*length, radius*r*width, radius*r, 0) for t,r in profiles[name]], material, bone, 24)
        obj.location = start
    else:
        obj = ellipsoid(name, (start + end) / 2, (radius * width, radius, (end - start).length / 2 + radius * .35), material, bone)
    obj.rotation_mode = 'QUATERNION'
    obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(end - start)
    return obj



def build(key, female, rival):
    global parts
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    parts = []
    rng = random.Random(17 + female * 10 + rival)
    skin = mat('Skin', '#b98669' if rival else '#cd9c7e', .57)
    skin_dark = mat('Skin detail', '#b18068', .55)
    shirt = mat('Technical fabric', '#653467' if female and rival else '#f3838c' if female else '#1d2636' if rival else '#f6f8fb', .88)
    lower = mat('Skirt or shorts', '#202839' if female and rival else '#f3f5fa' if female else '#172940', .9)
    hair = mat('Hair', '#30241f' if rival else '#493328', .62)
    hair_light = mat('Hair highlights', '#604631' if rival else '#6d5039', .62)
    white = mat('White fabric', '#f2f5f7', .8)
    accent = mat('Piping', '#9668ab' if female and rival else '#dc737e' if female else '#3e69b2' if rival else '#253e5d')
    shoe = lower if female and rival else white
    eye_white = mat('Eyes', '#e5dcd4', .35)
    iris = mat('Iris', '#524939', .3)
    pupil = mat('Pupil', '#101014', .3)
    lips = mat('Lips', '#aa7669', .6)
    shoulder = .226 if female else .265 if rival else .245
    # The pelvis, chest and face use tapered mesh profiles, not primitive boxes.
    rings('Shirt', [(1.0,.174,.11,0),(1.08,.171,.108,0),(1.19,.157 if female else .183,.105,0),(1.31,.185 if female else .21,.123,.012),(1.43,.20 if female else shoulder*.92,.13,.005),(1.50,shoulder*.87,.105,0),(1.535,.095,.072,0)], shirt, 'Spine')
    rings('Neck', [(1.48,.061,.057,0),(1.58,.054,.053,0),(1.635,.066,.06,0)], skin, 'Head')
    rings('Face', [(1.615,.03,.032,.018),(1.635,.058,.056,.009),(1.665,.074,.073,0),(1.70,.085,.082,0),(1.745,.094,.083,0),(1.775,.096,.084,-.004),(1.81,.095,.086,-.01),(1.845,.084,.08,-.012),(1.87,.057,.058,-.012),(1.88,.014,.014,-.012)], skin, 'Head')
    ellipsoid('Nose bridge', (0,.086,1.735), (.014,.023,.039), skin, 'Head')
    ellipsoid('Nose tip', (0,.108,1.71), (.018,.019,.013), skin, 'Head')
    for sign in [-1,1]:
        ellipsoid('Nostril', (sign*.013,.104,1.70), (.004,.004,.0025), skin_dark, 'Head',12)
        ellipsoid('Ear', (sign*.096,-.002,1.735), (.014,.021,.033), skin,'Head')
        ellipsoid('Ear inner', (sign*.105,.007,1.735), (.004,.013,.021), skin_dark,'Head',12)
        ellipsoid('Eye', (sign*.042,.077,1.761), (.019,.008,.0075), eye_white,'Head')
        ellipsoid('Iris', (sign*.042,.084,1.761), (.0065,.0018,.0065), iris,'Head',16)
        ellipsoid('Pupil', (sign*.042,.086,1.761), (.0028,.001,.0035), pupil,'Head',12)
        tube('Upper eyelid', [(sign*(.023+i*.006),.083-math.sin(i*.6)*.002,1.761+math.sin(i/6*math.pi)*.007) for i in range(7)], .0015,skin_dark,'Head')
        tube('Eyebrow', [(sign*(.018+i*.008),.083,1.783+math.sin(i/6*math.pi)*.006) for i in range(7)], .0035,hair,'Head')
    tube('Upper lip',[(-.025,.076,1.673),(-.011,.084,1.676),(0,.086,1.673),(.011,.084,1.676),(.025,.076,1.673)],.0022,lips,'Head')
    tube('Lower lip',[(-.023,.078,1.671),(0,.086,1.668),(.023,.078,1.671)],.0028,lips,'Head')
    tube('Collar stitching',[(.094*math.cos(t*math.pi/16),.073*math.sin(t*math.pi/16),1.535) for t in range(33)],.0025,white if rival else accent,'Spine')
    for sign in [-1, 1]:
        tube('Lower eyelid', [(sign*(.023+i*.006),.082,1.761-math.sin(i/6*math.pi)*.0055) for i in range(7)],.0013,skin_dark,'Head')
        ellipsoid('Eye catchlight',(sign*.041,.087,1.763),(.0014,.0006,.0014),eye_white,'Head',12)
    # Close-fitting crown plus individual swept locks or helical curls.
    rings('Hair cap',[(1.806,.096,.087,-.013),(1.845,.096,.086,-.015),(1.88,.075,.074,-.016),(1.901,.015,.015,-.016)],hair,'Head')
    if not female:
        for i in range(126 if rival else 100):
            x=(i%14-6.5)*.012
            y=.064-(i//14)*.017
            lift = math.sqrt(max(0, 1-(x/.1)**2))*.047 + rng.random()*.009
            points=[(x+t*.023,y-t*.045,1.85+lift+math.sin(t*math.pi)*(.032 if rival else .022)) for t in [0,.25,.5,.75,1]]
            tube('Swept hair',points,.0033 if rival else .0028,hair_light if i%5==0 else hair,'Head')
        if rival:
            for side in [-1,1]:
                tube('Beard jaw',[(side*.077,.052,1.699),(side*.066,.063,1.667),(side*.045,.061,1.642),(0,.052,1.633)],.010,hair,'Head')
                tube('Moustache',[(side*.006,.094,1.689),(side*.018,.087,1.685),(side*.026,.08,1.681)],.004,hair,'Head')
    else:
        for i in range(72):
            x=(i%12-5.5)*.015
            tube('Swept crown',[(x,.058,1.815),(x*.9,.015,1.88),(x*.7,-.077,1.856)],.0028,hair_light if i%5==0 else hair,'Head')
        for i in range(65 if rival else 40):
            angle = i * 2.4
            offset = math.cos(angle) * (.022 + (i % 3) * .009)
            if rival:
                points=[(offset+.012*math.cos(t*.9+i),-.115-t*.003+math.sin(angle)*.03+.014*math.sin(t*.9+i),1.85-t*.014) for t in range(31)]
            else:
                points=[(offset+math.sin(t*.25+i)*.007,-.11-t*.004+math.sin(angle)*.018,1.85-t*.013) for t in range(25)]
            tube('Curly ponytail' if rival else 'Ponytail',points,.0038,hair_light if i%5==0 else hair,'Head')
        if rival:
            for sign in [-1, 1]:
                tube('Temple curl',[(sign*(.077+math.sin(t*.8)*.005),.052+math.cos(t*.8)*.005,1.84-t*.009) for t in range(19)],.003,hair,'Head')
        ellipsoid('Hair tie',(0,-.088,1.84),(.043,.02,.025),accent,'Head')
    for sign in [-1,1]:
        suffix = 'R' if sign==-1 else 'L'
        upper, fore, hand, thigh, calf, foot=[f'{n}_{suffix}' for n in ['UpperArm','Forearm','Hand','Thigh','Calf','Foot']]
        a=(sign*shoulder,0,1.47); e=(sign*(shoulder+.045),.005,1.17); w=(sign*(shoulder+.07),.035,.925)
        ellipsoid('Shoulder',a,(.058 if female else .068,.075,.072),skin if female else shirt,upper)
        segment('Upper arm',a,e,.049 if female else .061,skin,upper)
        ellipsoid('Elbow',e,(.043,.045,.046),skin,fore)
        segment('Forearm',e,w,.039 if female else .047,skin,fore,width=1.03)
        if not female:
            segment('Short sleeve',a,(sign*(shoulder+.022),0,1.355),.077,shirt,upper)
        segment('Wristband',(w[0],w[1],.97),(w[0],w[1],.91),.047,lower if rival else white,fore)
        ellipsoid('Palm',(w[0],.038,.869),(.041,.022,.052),skin,hand)
        for finger in range(4):
            segment('Finger',(w[0]+(finger-1.5)*.017,.04,.864),(w[0]+(finger-1.5)*.017,.05,.815+abs(finger-1.5)*.008),.008,skin,hand)
        segment('Thumb',(w[0]-sign*.03,.05,.886),(w[0]-sign*.05,.07,.851),.011,skin,hand)
        h=(sign*.103,0,1.005); k=(sign*.113,.025,.57); ankle=(sign*.113,0,.16)
        segment('Thigh',h,k,.095 if female else .104,skin,thigh,width=1.03)
        ellipsoid('Knee',k,(.058,.06,.064),skin,calf)
        segment('Calf',k,ankle,.061 if female else .066,skin,calf)
        segment('Sock',(sign*.113,0,.30),(sign*.113,0,.13),.05,white,calf)
        ellipsoid('Trainer',(sign*.113,.042,.076),(.059,.127,.059),shoe,foot)
        ellipsoid('Sole',(sign*.113,.042,.035),(.061,.13,.023),white,foot)
        for lace in range(4):
            tube('Lace',[(sign*.113-.031,.045+lace*.017,.122),(sign*.113+.031,.045+lace*.017,.122)],.0025,white if rival else accent,foot)
        tube('Shoe stripe',[(sign*.113+sign*.058,-.02,.065),(sign*.113+sign*.06,.03,.084),(sign*.113+sign*.054,.092,.065)],.007,accent,foot)
        if not female:
            obj=rings('Shorts leg',[(.80,.113,.13,0),(.93,.125,.133,0),(1.055,.123,.132,0)],lower,thigh,24)
            obj.location.x=sign*.106
        tube('Shirt piping',[(sign*.077,.068,1.521),(sign*.16,.089,1.455),(sign*.19,.1,1.31),(sign*.16,.087,1.15),(sign*.163,.082,1.025)],.003,accent,'Spine')
    if not female:
        rings('Shorts waist',[(.94,.19,.124,0),(1.045,.193,.124,0)],lower,'Hips')
    if female:
        profile=[]
        for z,r in [(1.06,.178),(1.03,.184),(1.00,.212),(.97,.221),(.86,.244),(.80,.255)]:
            profile.append((z,r,r*.67,0))
        rings('Tennis skirt',profile,lower,'Hips')
        for i in range(12):
            angle=i*2*math.pi/12
            tube('Skirt pleat',[(r*math.cos(angle),r*.67*math.sin(angle),z) for z,r in [(1.0,.213),(.90,.236),(.80,.256)]],.002,accent if i%4==0 else lower,'Hips')
    # Fuse skin into a continuous surface, then blend joint weights near elbows,
    # wrists, knees and ankles so animation does not expose gaps between parts.
    skin_parts = [obj for obj in parts if obj.data.materials[0] == skin]
    bpy.ops.object.select_all(action='DESELECT')
    for obj in skin_parts: obj.select_set(True)
    bpy.context.view_layer.objects.active = skin_parts[0]
    bpy.ops.object.join()
    continuous = bpy.context.object
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    remesh = continuous.modifiers.new('Continuous anatomy', 'REMESH')
    remesh.mode = 'VOXEL'; remesh.voxel_size = .0035; remesh.use_smooth_shade = True
    bpy.ops.object.modifier_apply(modifier=remesh.name)
    smooth = continuous.modifiers.new('Surface relax', 'SMOOTH'); smooth.factor = .4; smooth.iterations = 3
    bpy.ops.object.modifier_apply(modifier=smooth.name)
    reduce = continuous.modifiers.new('Game mesh budget', 'DECIMATE'); reduce.ratio = .18
    bpy.ops.object.modifier_apply(modifier=reduce.name)
    continuous.vertex_groups.clear()
    groups = {}
    def weight(index, name, value):
        if value <= .0001: return
        if name not in groups: groups[name] = continuous.vertex_groups.new(name=name)
        groups[name].add([index], value, 'REPLACE')
    def blend(index, z, cut, width, high, low):
        t = max(0, min(1, (z - cut + width) / (2 * width)))
        weight(index, high, t); weight(index, low, 1 - t)
    for vertex in continuous.data.vertices:
        x,y,z = vertex.co
        side = 'R' if x < 0 else 'L'
        if z > 1.52 and abs(x) < .14: weight(vertex.index, 'Head', 1)
        elif abs(x) > (.14 if z > 1.09 else .24) and z > .77:
            if z > 1.10: blend(vertex.index,z,1.17,.07,f'UpperArm_{side}',f'Forearm_{side}')
            else: blend(vertex.index,z,.925,.045,f'Forearm_{side}',f'Hand_{side}')
        elif z < 1.09:
            if z > .45: blend(vertex.index,z,.57,.075,f'Thigh_{side}',f'Calf_{side}')
            else: blend(vertex.index,z,.16,.035,f'Calf_{side}',f'Foot_{side}')
        else: weight(vertex.index,'Head',1)
    parts = [obj for obj in parts if obj not in skin_parts] + [continuous]
    # One skinned mesh with shared material batches and a proper joint hierarchy.
    bpy.ops.object.select_all(action='DESELECT')
    for obj in parts: obj.select_set(True)
    bpy.context.view_layer.objects.active=parts[0]
    bpy.ops.object.join()
    body=bpy.context.object
    body.name='AthleteMesh'
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    detail = body.data.color_attributes.new(name='Surface detail', type='FLOAT_COLOR', domain='CORNER')
    for polygon in body.data.polygons:
        material = body.data.materials[polygon.material_index]
        for loop_index in polygon.loop_indices:
            v = body.data.vertices[body.data.loops[loop_index].vertex_index].co
            grain = math.sin(v.x * 2100 + v.z * 1380) * math.sin(v.y * 1730 - v.z * 970)
            shade = .97 + grain * .025
            tint = (shade, shade, shade, 1)
            if material == skin:
                blush = .045 * math.exp(-((abs(v.x)-.055)/.03)**2 - ((v.z-1.735)/.022)**2) * max(0, v.y/.09)
                tint = (shade, shade-blush, shade-blush*.8, 1)
            detail.data[loop_index].color = tuple(tint[i] * material.diffuse_color[i] for i in range(3)) + (1,)
    for material in body.data.materials:
        vertex_color = material.node_tree.nodes.new('ShaderNodeVertexColor')
        vertex_color.layer_name = 'Surface detail'
        material.node_tree.links.new(vertex_color.outputs['Color'], material.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
    arm_data=bpy.data.armatures.new('AthleteSkeleton')
    rig=bpy.data.objects.new('AthleteRig',arm_data)
    bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active=rig
    bpy.ops.object.select_all(action='DESELECT');rig.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    def bone(name,head,tail,parent=None):
        b=arm_data.edit_bones.new(name); b.head=head;b.tail=tail
        if parent:b.parent=arm_data.edit_bones[parent]
    bone('Hips',(0,0,.99),(0,0,1.08))
    bone('Spine',(0,0,1.08),(0,0,1.53),'Hips')
    bone('Head',(0,0,1.53),(0,0,1.86),'Spine')
    for sign in [-1,1]:
        suffix='R' if sign==-1 else 'L'
        a=(sign*shoulder,0,1.47);e=(sign*(shoulder+.045),.005,1.17);w=(sign*(shoulder+.07),.035,.925)
        bone(f'UpperArm_{suffix}',a,e,'Spine');bone(f'Forearm_{suffix}',e,w,f'UpperArm_{suffix}');bone(f'Hand_{suffix}',w,(w[0],.05,.82),f'Forearm_{suffix}')
        bone(f'Thigh_{suffix}',(sign*.103,0,1.005),(sign*.113,.025,.57),'Hips');bone(f'Calf_{suffix}',(sign*.113,.025,.57),(sign*.113,0,.16),f'Thigh_{suffix}');bone(f'Foot_{suffix}',(sign*.113,0,.16),(sign*.113,.15,.08),f'Calf_{suffix}')
    bpy.ops.object.mode_set(mode='OBJECT')
    body.parent=rig
    modifier=body.modifiers.new('Skeleton','ARMATURE');modifier.object=rig
    if female: rig.scale=(.94,.94,.94)
    body.select_set(True);rig.select_set(True)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/(key+'.blend')), compress=True)
    bpy.ops.export_scene.gltf(filepath=str(OUT/(key+'.glb')),export_format='GLB',use_selection=True,export_animations=False,export_yup=True,export_apply=False)
    print('BASELINE_MODEL',key,len(body.data.vertices),len(body.data.polygons))

for key,female,rival in [('male-player',False,False),('male-rival',False,True),('female-player',True,False),('female-rival',True,True)]:
    build(key,female,rival)
