import os
import sys
from distutils.core import setup
from setuptools.command.install import install
from setuptools.command.develop import develop
from notebook.nbextensions import install_nbextension
from notebook.services.config import ConfigManager

livereveal_dir = os.path.join(os.path.dirname(__file__), 'livereveal')

def _enable():
    # Enable the extension
    cm = ConfigManager()
    cm.update('notebook', {"load_extensions": {"livereveal/main": True}})

def _install():
    # Install the livereveal code.
    install_nbextension(livereveal_dir, overwrite=True, user=True)

    print("RISE has been installed.")

def _develop():
    # Symlink the livereveal code.
    install_nbextension(livereveal_dir, symlink=True, user=True)

    print("RISE has been installed in develop/symlink mode.")


class rise_install(install):
    def run(self):
        _install()
        _enable()

class rise_develop(develop):
    def run(self):
        _develop()
        _enable()


setup_args = dict(
    name                = 'RISE',
    version             = '4.0.4',
    description         = "Reveal.js - Jupyter/IPython Slideshow Extension.",
    long_description    = """Install the Reveal-js based slideshow extension into the Jupyter system.""",
    install_requires    = ['notebook'],
    cmdclass            = dict(install=rise_install, develop=rise_develop),
    #packages            = {'livereveal'},
    #package_data        = dict(livereveal=['*']),
    #package_data        = {'livereveal': ['*.js','*.txt']},
    author              = "Damián Avila",
    author_email        = "info@oquanta.info",
    url                 = "http://github.com/damianavila/RISE",
    license             = "BSD",
    classifiers         = [
        'Intended Audience :: Developers',
        'Intended Audience :: System Administrators',
        'Intended Audience :: Science/Research',
        'License :: OSI Approved :: BSD License',
        'Programming Language :: Python',
        'Programming Language :: Python :: 2',
        'Programming Language :: Python :: 2.7',
        'Programming Language :: Python :: 3',
        'Programming Language :: Python :: 3.4',
        'Programming Language :: Python :: 3.5',
    ],
)

if any(bdist in sys.argv for bdist in ['bdist_wheel', 'bdist_egg']):
    import setuptools


if __name__ == '__main__':
    setup(**setup_args)
